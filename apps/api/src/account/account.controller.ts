import { Body, Controller, Get, HttpCode, Module, Patch, Post, Req } from '@nestjs/common';
import {
  consentSchema,
  ERROR_MESSAGES,
  isPlaceholderEmail,
  sellerRegisterSchema,
  sellerUpdateSchema,
  updateProfileSchema,
  type ConsentInput,
  type SellerInfoDto,
  type SellerRegisterInput,
  type SellerUpdateInput,
  type UpdateProfileInput,
} from '@shop/shared';
import type { Request } from 'express';
import { AppException } from '../common/app-exception';
import {
  ConsentExempt,
  CurrentUser,
  hasRequiredConsent,
  invalidateUserStatus,
  type AuthUser,
} from '../common/auth';
import { encrypt, maskTail } from '../common/crypto';
import { clientIp } from '../common/rate-limit';
import { assertClean } from '../common/moderation';
import { ZodPipe } from '../common/zod.pipe';
import { IdentityModule } from '../identity/identity.controller';
import { IdentityService } from '../identity/identity.service';
import { AdminNotifier } from '../notifications/admin-notifier';
import { logNotifyError, NotificationEvents } from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthModule } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { DemoBlocked } from '../auth/demo';
import { SessionService } from '../auth/session.service';
import { RequireReauth } from '../security/reauth.guard';
import { SecurityService } from '../security/security.service';

@Controller()
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly security: SecurityService,
    private readonly auth: AuthService,
    private readonly events: NotificationEvents,
    private readonly admins: AdminNotifier,
  ) {}

  @Patch('users/me/profile')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    assertClean({ nickname: body.nickname, bio: body.bio, region: body.region });
    if (body.nickname) {
      const taken = await this.prisma.profile.findFirst({
        where: { nickname: body.nickname, userId: { not: user.id } },
        select: { userId: true },
      });
      if (taken) throw new AppException('NICKNAME_TAKEN');
    }
    if (body.avatarKey) {
      const owner = await this.redis.get(`media:owner:${body.avatarKey}`);
      const current = await this.prisma.profile.findUnique({
        where: { userId: user.id },
        select: { avatarKey: true },
      });
      if (owner !== user.id && current?.avatarKey !== body.avatarKey) {
        throw new AppException('INVALID_IMAGE', '업로드한 이미지만 사용할 수 있습니다.');
      }
    }
    await this.prisma.profile.update({
      where: { userId: user.id },
      data: {
        nickname: body.nickname,
        bio: body.bio,
        avatarKey: body.avatarKey,
        region: body.region,
      },
    });
    return this.sessions.me(user.id);
  }

  // ───── 가입 마무리 · 약관 동의 (소셜 첫 로그인·약관 개정 후) · 마케팅 수신 동의 변경 ─────

  /**
   * 필수 동의 3개(약관·개인정보·만 14세)와 선택 마케팅 동의를 기록한다. 이미 동의한 회원은 마케팅 수신 여부만
   * 바꾸는 용도로 다시 보낼 수 있다 (필수 동의 시각은 처음 값을 유지).
   * 소셜 가입 마무리: emailVerificationToken(SIGNUP) 이 있으면 그 이메일로 바꾸고 인증 완료로 기록하며,
   * nickname 이 있으면 닉네임을 바꾼다. provider 가 이메일을 주지 않은 회원(임시 주소)은 처음 동의할 때 이메일 인증이 필요하다.
   */
  @ConsentExempt()
  @Post('me/consent')
  @HttpCode(200)
  async consent(@CurrentUser() user: AuthUser, @Body(new ZodPipe(consentSchema)) body: ConsentInput) {
    const now = new Date();
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        email: true,
        termsAgreedAt: true,
        privacyAgreedAt: true,
        ageConfirmedAt: true,
        marketingOptIn: true,
        marketingAgreedAt: true,
        profile: { select: { nickname: true } },
      },
    });
    if (!body.emailVerificationToken && !hasRequiredConsent(u) && isPlaceholderEmail(u.email)) {
      throw new AppException('VALIDATION_FAILED', '이메일을 입력해주세요.', {
        fields: { email: '이메일을 입력해주세요.' },
      });
    }

    const nickname = body.nickname && body.nickname !== u.profile?.nickname ? body.nickname : undefined;
    if (nickname) {
      assertClean({ nickname });
      const taken = await this.prisma.profile.findFirst({
        where: { nickname, userId: { not: user.id } },
        select: { userId: true },
      });
      if (taken)
        throw new AppException('NICKNAME_TAKEN', undefined, {
          fields: { nickname: ERROR_MESSAGES.NICKNAME_TAKEN },
        });
    }

    // 닉네임 검사를 통과한 뒤에 토큰을 쓴다 (닉네임만 고쳐 다시 보낼 때 이메일을 다시 인증하지 않게)
    let email: string | undefined;
    if (body.emailVerificationToken) {
      const verified = await this.auth.consumeVerification(body.emailVerificationToken, 'SIGNUP');
      if (verified !== u.email) {
        const other = await this.prisma.user.findUnique({ where: { email: verified }, select: { id: true } });
        if (other) {
          const message = '이미 가입된 이메일입니다. 다른 이메일을 입력해주세요.';
          throw new AppException('ACCOUNT_EXISTS', message, { fields: { email: message } });
        }
      }
      email = verified;
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          termsAgreedAt: u.termsAgreedAt ?? now,
          privacyAgreedAt: u.privacyAgreedAt ?? now,
          ageConfirmedAt: u.ageConfirmedAt ?? now,
          marketingOptIn: body.marketing,
          // 동의 일시는 새로 동의할 때만 바꾸고, 철회하면 지운다
          marketingAgreedAt: body.marketing ? (u.marketingOptIn ? u.marketingAgreedAt : now) : null,
          ...(email ? { email, emailVerifiedAt: now } : {}),
        },
      }),
      ...(nickname ? [this.prisma.profile.update({ where: { userId: user.id }, data: { nickname } })] : []),
    ]);
    await invalidateUserStatus(this.redis, user.id);
    // 소셜 가입 마무리: 필수 동의가 처음 채워질 때만 (마케팅 수신 변경으로 다시 보낼 때는 보내지 않는다)
    if (!hasRequiredConsent(u)) void this.events.welcome(user.id).catch(logNotifyError);
    return this.sessions.me(user.id);
  }

  // ───── 판매자 등록 ↔ 정보 조회 ↔ 수정 ─────

  @Get('me/seller')
  async seller(@CurrentUser() user: AuthUser): Promise<SellerInfoDto> {
    const s = await this.prisma.seller.findUnique({ where: { userId: user.id } });
    if (!s) throw new AppException('SELLER_REQUIRED', undefined, undefined, 404);
    return {
      businessName: s.businessName,
      bankName: s.bankName,
      bankAccountMasked: s.bankAccountMasked,
      accountHolder: s.accountHolder,
      verified: !!s.verifiedAt,
    };
  }

  @DemoBlocked()
  @Post('me/seller')
  @HttpCode(201)
  async registerSeller(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(sellerRegisterSchema)) body: SellerRegisterInput,
    @Req() req: Request,
  ) {
    // 판매자는 정산을 받으므로 본인인증을 요구한다 (PortOne 키가 설정된 환경)
    await this.identity.assertVerified(user.id);
    const exists = await this.prisma.seller.findUnique({ where: { userId: user.id } });
    if (exists) throw new AppException('CONFLICT', '이미 판매자로 등록되어 있습니다.');
    await this.prisma.$transaction([
      this.prisma.seller.create({
        data: {
          userId: user.id,
          businessName: body.businessName ?? null,
          bankName: body.bankName,
          bankAccountEnc: encrypt(body.bankAccount),
          bankAccountMasked: maskTail(body.bankAccount),
          accountHolder: body.accountHolder,
        },
      }),
      // USER 만 SELLER 로 올린다 (관리자·인증 판매자 역할은 유지)
      this.prisma.user.updateMany({ where: { id: user.id, role: 'USER' }, data: { role: 'SELLER' } }),
    ]);
    await invalidateUserStatus(this.redis, user.id);
    await this.security.record(
      user.id,
      'SETTLEMENT_ACCOUNT_CHANGED',
      await this.security.contextOf(user, clientIp(req)),
      { registered: true, bankName: body.bankName, bankAccountMasked: maskTail(body.bankAccount) },
    );
    // 판매자 등록 = 인증 신청 (관리자가 확인 후 인증)
    void this.admins.sellerRegistered(user.id).catch(logNotifyError);
    return this.sessions.me(user.id);
  }

  /** 정산 정보 수정 — 입금 계좌가 바뀔 수 있으므로 재인증을 요구한다 */
  @RequireReauth()
  @DemoBlocked()
  @Patch('me/seller')
  async updateSeller(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(sellerUpdateSchema)) body: SellerUpdateInput,
    @Req() req: Request,
  ) {
    const exists = await this.prisma.seller.findUnique({ where: { userId: user.id } });
    if (!exists) throw new AppException('SELLER_REQUIRED', undefined, undefined, 404);
    await this.prisma.seller.update({
      where: { userId: user.id },
      data: {
        businessName: body.businessName,
        bankName: body.bankName,
        accountHolder: body.accountHolder,
        ...(body.bankAccount
          ? { bankAccountEnc: encrypt(body.bankAccount), bankAccountMasked: maskTail(body.bankAccount) }
          : {}),
      },
    });
    const changed = (['bankName', 'bankAccount', 'accountHolder'] as const).filter(
      (k) => body[k] !== undefined,
    );
    if (changed.length)
      await this.security.record(
        user.id,
        'SETTLEMENT_ACCOUNT_CHANGED',
        await this.security.contextOf(user, clientIp(req)),
        {
          fields: changed,
          ...(body.bankName ? { bankName: body.bankName } : {}),
          ...(body.bankAccount ? { bankAccountMasked: maskTail(body.bankAccount) } : {}),
        },
      );
    return this.seller(user);
  }
}

@Module({
  imports: [IdentityModule, AuthModule],
  controllers: [AccountController],
})
export class AccountModule {}
