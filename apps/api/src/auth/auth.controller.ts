import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  appleNativeSchema,
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  oauthCallbackSchema,
  oauthLinkSchema,
  refreshSchema,
  resetPasswordSchema,
  sendCodeSchema,
  signupSchema,
  verifyCodeSchema,
  type AppleNativeInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type LoginInput,
  type OAuthCallbackInput,
  type OAuthLinkInput,
  type ResetPasswordInput,
  type SendCodeInput,
  type SignupInput,
  type VerifyCodeInput,
} from '@shop/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppException } from '../common/app-exception';
import { ConsentExempt, CurrentUser, Public, type AuthUser } from '../common/auth';
import { clientIp, RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { env, isProd } from '../config/env';
import { IdentityModule } from '../identity/identity.controller';
import { IdentityService } from '../identity/identity.service';
import { AppleAuthClient } from './apple.client';
import { AuthService } from './auth.service';
import { DemoAccountsService, DemoBlocked } from './demo';
import type { OAuthProfile } from './oauth.providers';
import { OAuthService, providerFromParam } from './oauth.service';
import { type ClientInfo, REFRESH_TTL_DAYS, SessionService } from './session.service';

const COOKIE = 'rt';
const COOKIE_PATH = '/api/v1/auth';
const urlQuery = z.object({
  redirectUri: z.string().url().optional(),
  appRedirect: z.string().max(300).optional(),
});

const client = (req: Request): ClientInfo => ({
  ip: clientIp(req),
  userAgent: req.headers['user-agent'] ?? '',
});

/**
 * 쿠키로 인증하는 요청(refresh/logout)은 CSRF 방어: 커스텀 헤더 + Origin 허용 목록 (docs/SECURITY.md)
 */
function assertCsrf(req: Request) {
  if (req.headers['x-requested-with'] !== 'shop') throw new AppException('FORBIDDEN');
  const origin = req.headers.origin;
  const allowed = env()
    .WEB_ORIGIN.split(',')
    .map((s) => s.trim());
  if (origin && !allowed.includes(origin)) throw new AppException('FORBIDDEN');
}

/** 인증·기기·탈퇴·소셜 연결은 동의 전에도 쓸 수 있다 (동의 화면에서 로그아웃·탈퇴할 수 있어야 한다) */
@ConsentExempt()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly oauth: OAuthService,
    private readonly identity: IdentityService,
  ) {}

  /** Web 은 httpOnly 쿠키, 앱은 본문으로 refresh 토큰을 준다 */
  private async respond(
    res: Response,
    user: Pick<User, 'id' | 'role'>,
    issued: { accessToken: string; refreshToken: string },
    platform: string,
    extra: Record<string, unknown> = {},
  ) {
    const web = platform === 'web';
    if (web) {
      res.cookie(COOKIE, issued.refreshToken, {
        httpOnly: true,
        secure: isProd(),
        sameSite: 'lax',
        path: COOKIE_PATH,
        maxAge: REFRESH_TTL_DAYS * 86_400_000,
      });
    }
    return { ...(await this.sessions.tokens(user, issued, !web)), ...extra };
  }

  @Public()
  @Get('providers')
  providers() {
    return {
      oauth: this.oauth.configured(),
      appleNative: this.oauth.appleNativeConfigured(),
      identity: this.identity.clientConfig(),
    };
  }

  @Public()
  @DemoBlocked()
  @Post('email/send-code')
  @HttpCode(200)
  @RateLimit({ name: 'otp-ip', limit: 20, windowSec: 3600, by: 'ip' })
  sendCode(@Body(new ZodPipe(sendCodeSchema)) body: SendCodeInput) {
    return this.auth.sendCode(body);
  }

  @Public()
  @DemoBlocked()
  @Post('email/verify-code')
  @HttpCode(200)
  @RateLimit({ name: 'otp-verify', limit: 30, windowSec: 600, by: 'ip' })
  verifyCode(@Body(new ZodPipe(verifyCodeSchema)) body: VerifyCodeInput) {
    return this.auth.verifyCode(body);
  }

  @Public()
  @DemoBlocked()
  @Post('signup')
  @RateLimit({ name: 'signup', limit: 10, windowSec: 3600, by: 'ip' })
  async signup(
    @Body(new ZodPipe(signupSchema)) body: SignupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.signup(body, client(req));
    return this.respond(res, r.user, r.issued, r.platform);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ name: 'login', limit: 20, windowSec: 60, by: 'ip' })
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.login(body, client(req));
    return this.respond(res, r.user, r.issued, r.platform);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ name: 'refresh', limit: 60, windowSec: 60, by: 'ip' })
  async refresh(
    @Body(new ZodPipe(refreshSchema)) body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
    const token = body.refreshToken ?? cookieToken;
    if (!token) throw new AppException('UNAUTHORIZED');
    if (!body.refreshToken) assertCsrf(req);
    try {
      const r = await this.sessions.rotate(token, client(req));
      return await this.respond(res, r.user, r, r.platform);
    } catch (e) {
      if (cookieToken) res.clearCookie(COOKIE, { path: COOKIE_PATH });
      throw e;
    }
  }

  /** 로그아웃 — 토큰이 만료돼도 항상 성공 (쿠키·세션 정리) */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodPipe(refreshSchema)) body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
    if (!body.refreshToken && cookieToken) assertCsrf(req);
    const token = body.refreshToken ?? cookieToken;
    if (token) await this.sessions.revokeByRefresh(token);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  @Public()
  @DemoBlocked()
  @Post('password/reset')
  @HttpCode(204)
  resetPassword(@Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.auth.resetPassword(body);
  }

  @DemoBlocked()
  @Post('password/change')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.auth.changePassword(user.id, user.sessionId, body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.sessions.me(user.id);
  }

  // ───── 기기(세션) 관리: 목록 ↔ 개별 로그아웃 ↔ 다른 기기 전체 로그아웃 ─────

  @Get('sessions')
  list(@CurrentUser() user: AuthUser) {
    return this.sessions.list(user.id, user.sessionId);
  }

  @Delete('sessions/:familyId')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthUser, @Param('familyId') familyId: string) {
    const owned = await this.sessions.list(user.id, user.sessionId);
    if (!owned.some((s) => s.id === familyId)) throw new AppException('NOT_FOUND');
    await this.sessions.revokeFamily(familyId);
  }

  @Delete('sessions')
  @HttpCode(204)
  async revokeOthers(@CurrentUser() user: AuthUser) {
    await this.sessions.revokeAll(user.id, await this.sessions.familyOf(user.sessionId));
  }

  @DemoBlocked()
  @Delete('account')
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.deleteAccount(user.id, body);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  // ───── 소셜 로그인 ─────

  @Public()
  @DemoBlocked()
  @Get('oauth/:provider/url')
  oauthUrl(@Param('provider') p: string, @Query(new ZodPipe(urlQuery)) q: z.infer<typeof urlQuery>) {
    if (!q.redirectUri && !q.appRedirect) throw new AppException('VALIDATION_FAILED');
    return this.oauth.authorizeUrl(providerFromParam(p), q.redirectUri ?? '', q.appRedirect);
  }

  /** 모바일 앱 중계: provider 가 돌려준 code/state 를 앱 딥링크로 넘긴다 */
  @Public()
  @DemoBlocked()
  @Get('oauth/:provider/redirect')
  async relay(@Param('provider') p: string, @Query() q: Record<string, string>, @Res() res: Response) {
    providerFromParam(p);
    const target = q.state ? await this.oauth.relayTarget(q.state) : null;
    if (!target) {
      res.status(400).send('로그인 요청이 만료되었습니다. 앱에서 다시 시도해주세요.');
      return;
    }
    const params = new URLSearchParams({ code: q.code ?? '', state: q.state ?? '', error: q.error ?? '' });
    res.redirect(302, `${target}?${params}`);
  }

  @Public()
  @DemoBlocked()
  @Post('oauth/:provider/callback')
  @HttpCode(200)
  @RateLimit({ name: 'oauth', limit: 30, windowSec: 600, by: 'ip' })
  async oauthCallback(
    @Param('provider') p: string,
    @Body(new ZodPipe(oauthCallbackSchema)) body: OAuthCallbackInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = providerFromParam(p);
    const profile = await this.oauth.profileFor(provider, body.code, body.state, body.redirectUri);
    const r = await this.oauth.signIn(provider, profile, body.device, client(req), body.name);
    return this.respond(res, r.user, r.issued, body.device.platform, { isNewUser: r.isNew });
  }

  @Public()
  @DemoBlocked()
  @Post('oauth/apple/native')
  @HttpCode(200)
  @RateLimit({ name: 'oauth', limit: 30, windowSec: 600, by: 'ip' })
  async appleNative(
    @Body(new ZodPipe(appleNativeSchema)) body: AppleNativeInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.oauth.appleNative(
      body.identityToken,
      body.authorizationCode,
      body.name,
      body.device,
      client(req),
    );
    return this.respond(res, r.user, r.issued, body.device.platform, { isNewUser: r.isNew });
  }

  // ───── 소셜 계정 연결 ↔ 해제 ─────

  @DemoBlocked()
  @Post('social/:provider')
  @HttpCode(204)
  async link(
    @CurrentUser() user: AuthUser,
    @Param('provider') p: string,
    @Body(new ZodPipe(oauthLinkSchema)) body: OAuthLinkInput,
  ) {
    const provider = providerFromParam(p);
    let profile: OAuthProfile;
    if ('identityToken' in body) {
      // iOS 네이티브 Apple 연결
      if (provider !== 'APPLE') throw new AppException('VALIDATION_FAILED');
      profile = await this.oauth.appleNativeProfile(body.identityToken, body.authorizationCode);
    } else {
      profile = await this.oauth.profileFor(provider, body.code, body.state, body.redirectUri);
    }
    await this.oauth.link(user.id, provider, profile);
  }

  @DemoBlocked()
  @Delete('social/:provider')
  @HttpCode(204)
  unlink(@CurrentUser() user: AuthUser, @Param('provider') p: string) {
    return this.oauth.unlink(user.id, providerFromParam(p));
  }
}

@Module({
  imports: [IdentityModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, OAuthService, AppleAuthClient, DemoAccountsService],
  exports: [SessionService, OAuthService, AuthService],
})
export class AuthModule {}
