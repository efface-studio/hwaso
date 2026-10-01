import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query, Req } from '@nestjs/common';
import {
  REAUTH_HEADER,
  quickLoginDeviceSchema,
  quickLoginRegisterSchema,
  quickLoginSchema,
  type QuickLoginDeviceInput,
  type QuickLoginInput,
  type QuickLoginRegisterInput,
  type QuickLoginTokens,
} from '@shop/shared';
import type { Request } from 'express';
import { ConsentExempt, CurrentUser, Public, type AuthUser } from '../common/auth';
import { clientIp, RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { SecurityService } from '../security/security.service';
import { DemoBlocked } from './demo';
import { QuickLoginService } from './quick-login.service';
import { SessionService } from './session.service';

/**
 * Face ID·지문 빠른 로그인 (앱 전용, docs/AUTH.md §9).
 * 켜기·상태·다시 묶기·끄기는 로그인한 기기에서, 로그인은 공개 엔드포인트로 한다.
 */
@ConsentExempt()
@Controller('auth/quick-login')
export class QuickLoginController {
  constructor(
    private readonly quick: QuickLoginService,
    private readonly sessions: SessionService,
    private readonly security: SecurityService,
  ) {}

  @Public()
  @DemoBlocked()
  @Post()
  @HttpCode(200)
  @RateLimit({ name: 'quick-login', limit: 20, windowSec: 60, by: 'ip' })
  async login(
    @Body(new ZodPipe(quickLoginSchema)) body: QuickLoginInput,
    @Req() req: Request,
  ): Promise<QuickLoginTokens> {
    const client = { ip: clientIp(req), userAgent: req.headers['user-agent'] ?? '' };
    const r = await this.quick.login(body, client);
    // 일반 로그인과 같은 보안 기록 · 새 기기 알림
    await this.security.afterLogin(r.user, r.issued.familyId, body.device, client, { method: 'quick' });
    return { ...(await this.sessions.tokens(r.user, r.issued, true)), quickLogin: r.quickLogin };
  }

  /** 이 기기에 켜기 (secret 은 이 응답에서 한 번만). 로그인 10분 뒤에는 재인증 토큰 필요 */
  @DemoBlocked()
  @Post('register')
  @HttpCode(201)
  @RateLimit({ name: 'quick-login-register', limit: 10, windowSec: 3600, by: 'user' })
  register(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(quickLoginRegisterSchema)) body: QuickLoginRegisterInput,
    @Req() req: Request,
  ) {
    const header = req.headers[REAUTH_HEADER];
    return this.quick.register(user, body, typeof header === 'string' ? header : null, clientIp(req));
  }

  @Get()
  status(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(quickLoginDeviceSchema)) q: QuickLoginDeviceInput,
  ) {
    return this.quick.status(user, q.deviceId);
  }

  /** 다른 방법으로 다시 로그인한 기기의 자격을 지금 세션에 묶는다 */
  @Patch()
  attach(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(quickLoginDeviceSchema)) body: QuickLoginDeviceInput,
  ) {
    return this.quick.attach(user, body.deviceId);
  }

  @Delete()
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(quickLoginDeviceSchema)) body: QuickLoginDeviceInput,
    @Req() req: Request,
  ) {
    return this.quick.remove(user, body.deviceId, clientIp(req));
  }
}
