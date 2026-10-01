import { Injectable } from '@nestjs/common';
import type { VerificationPurpose } from '@prisma/client';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  ReauthInput,
  ReauthResult,
  ResetPasswordInput,
  SendCodeInput,
  SignupInput,
  VerifyCodeInput,
} from '@shop/shared';
import argon2 from 'argon2';
import { AppException } from '../common/app-exception';
import {
  type AuthUser,
  invalidateUserStatus,
  signPurposeToken,
  signReauthToken,
  verifyPurposeToken,
} from '../common/auth';
import { hmac, otpCode, randomToken, safeEqual } from '../common/crypto';
import { RateLimitService } from '../common/rate-limit';
import { env, isDemo } from '../config/env';
import { assertClean } from '../common/moderation';
import { MailService } from '../mail/mail.service';
import { logNotifyError, NotificationEvents } from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { type EventContext, SecurityService } from '../security/security.service';
import { isDemoLogin } from './demo';
import { OAuthService } from './oauth.service';
import { type ClientInfo, SessionService } from './session.service';

const CODE_TTL_MIN = 10;
const CODE_MAX_ATTEMPTS = 5;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_SEC = 15 * 60;
const ARGON = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
/** 존재하지 않는 계정도 같은 시간이 걸리도록 비교할 더미 해시 */
let dummyHash: Promise<string> | null = null;

const PURPOSE_SUBJECT: Record<VerificationPurpose, string> = {
  SIGNUP: '회원가입 인증번호',
  RESET_PASSWORD: '비밀번호 재설정 인증번호',
  DELETE_ACCOUNT: '회원 탈퇴 확인 인증번호',
  REAUTH: '본인 확인 인증번호',
};

const ACTIVE_TRADE_STATUSES = [
  'PAYMENT_PENDING',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'REFUND_REQUESTED',
] as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly limiter: RateLimitService,
    private readonly sessions: SessionService,
    private readonly security: SecurityService,
    private readonly oauth: OAuthService,
    private readonly events: NotificationEvents,
  ) {}

  static hashPassword(pw: string) {
    return argon2.hash(pw, ARGON);
  }

  private codeHash(email: string, purpose: string, code: string) {
    return hmac(env().OTP_SECRET, `${email}:${purpose}:${code}`);
  }

  // ───── 이메일 인증번호 ─────

  async sendCode({ email, purpose }: SendCodeInput): Promise<{ retryAfterSec: number }> {
    // 60초 간격, 시간당 5회 (docs/API.md Rate Limit)
    if (!(await this.redis.set(`otp:gap:${purpose}:${email}`, '1', 'EX', 60, 'NX'))) {
      throw new AppException('RATE_LIMITED', '인증번호는 1분에 한 번만 요청할 수 있습니다.');
    }
    await this.limiter.assert(`otp:${email}`, 5, 3600);

    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, status: true } });
    const exists = !!user && user.status !== 'DELETED';

    // 계정 존재 여부는 응답으로 드러내지 않는다 (계정 열거 방지)
    if (purpose === 'SIGNUP' && exists) {
      await this.mail.send({
        to: email,
        subject: '[화소] 이미 가입된 이메일입니다',
        text: '이 이메일로 이미 가입된 계정이 있습니다. 로그인하거나 비밀번호 찾기를 이용해주세요.',
      });
      return { retryAfterSec: 60 };
    }
    if (purpose !== 'SIGNUP' && !exists) return { retryAfterSec: 60 };

    await this.issueCode(email, purpose);
    return { retryAfterSec: 60 };
  }

  private async issueCode(email: string, purpose: VerificationPurpose) {
    const code = otpCode();
    await this.prisma.verificationCode.create({
      data: {
        email,
        purpose,
        codeHash: this.codeHash(email, purpose, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
      },
    });
    await this.mail.send({
      to: email,
      subject: `[화소] ${PURPOSE_SUBJECT[purpose]}`,
      text: `인증번호: ${code}\n\n${CODE_TTL_MIN}분 안에 입력해주세요. 요청하지 않았다면 이 메일을 무시하세요.`,
    });
  }

  async verifyCode({ email, purpose, code }: VerifyCodeInput): Promise<{ verificationToken: string }> {
    await this.consumeCode(email, purpose, code);
    const verificationToken = await signPurposeToken({ typ: 'verify', email, purpose }, CODE_TTL_MIN * 60);
    return { verificationToken };
  }

  /** 최신 인증번호를 확인하고 1회용으로 소비한다. 틀리면 시도 횟수를 늘리고 던진다 */
  private async consumeCode(email: string, purpose: VerificationPurpose, code: string) {
    const row = await this.prisma.verificationCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new AppException('INVALID_CODE');
    if (row.expiresAt < new Date()) throw new AppException('CODE_EXPIRED');
    if (row.attempts >= CODE_MAX_ATTEMPTS) throw new AppException('CODE_ATTEMPTS_EXCEEDED');

    if (!safeEqual(row.codeHash, this.codeHash(email, purpose, code))) {
      await this.prisma.verificationCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      const left = CODE_MAX_ATTEMPTS - row.attempts - 1;
      throw new AppException(
        left > 0 ? 'INVALID_CODE' : 'CODE_ATTEMPTS_EXCEEDED',
        left > 0 ? `인증번호가 올바르지 않습니다. (남은 시도 ${left}회)` : undefined,
      );
    }
    // 1회용 소비 (동시 제출 방지)
    const consumed = await this.prisma.verificationCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (!consumed.count) throw new AppException('INVALID_CODE');
  }

  /** 이메일 인증 토큰을 한 번 쓰고 인증된 이메일을 돌려준다 (가입 마무리 POST /me/consent 도 쓴다) */
  async consumeVerification(token: string, purpose: VerificationPurpose): Promise<string> {
    const claims = await verifyPurposeToken<{ email: string; purpose: string; jti?: string }>(
      token,
      'verify',
    );
    if (claims.purpose !== purpose) throw new AppException('INVALID_TOKEN');
    // 같은 인증 토큰으로 두 번 가입/재설정하지 못하게 한 번만 사용
    const once = await this.redis.set(`verify:used:${token.slice(-32)}`, '1', 'EX', CODE_TTL_MIN * 60, 'NX');
    if (!once) throw new AppException('INVALID_TOKEN', '이미 사용된 인증입니다. 처음부터 다시 진행해주세요.');
    return claims.email;
  }

  // ───── 가입 · 로그인 ─────

  async signup(input: SignupInput, client: ClientInfo) {
    assertClean({ nickname: input.nickname });
    const email = await this.consumeVerification(input.verificationToken, 'SIGNUP');
    const taken = await this.prisma.profile.findUnique({
      where: { nickname: input.nickname },
      select: { userId: true },
    });
    if (taken) throw new AppException('NICKNAME_TAKEN');
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppException('CONFLICT', '이미 가입된 이메일입니다. 로그인해주세요.');

    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await AuthService.hashPassword(input.password),
        emailVerifiedAt: now,
        // 스키마가 세 필수 동의(literal true)를 모두 확인했다
        termsAgreedAt: now,
        privacyAgreedAt: now,
        ageConfirmedAt: now,
        marketingOptIn: input.agreeMarketing,
        marketingAgreedAt: input.agreeMarketing ? now : null,
        profile: { create: { nickname: input.nickname } },
      },
    });
    const issued = await this.sessions.issue(user, input.device, client);
    // 이메일 가입은 가입 요청에서 동의까지 받으므로 여기서 가입이 끝난다
    void this.events.welcome(user.id).catch(logNotifyError);
    return { user, issued, platform: input.device.platform };
  }

  async login(input: LoginInput, client: ClientInfo) {
    // 공개 데모: 지정 계정만 로그인하고, 누구나 아는 계정이 잠기지 않게 실패 잠금을 쓰지 않는다
    const demo = isDemo();
    if (demo && !isDemoLogin(input.email)) throw new AppException('INVALID_CREDENTIALS');
    const lockKey = `login:fail:${input.email}`;
    const failures = demo ? 0 : Number((await this.redis.get(lockKey)) ?? 0);
    if (failures >= LOGIN_MAX_FAILURES) throw new AppException('ACCOUNT_LOCKED');

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    dummyHash ??= argon2.hash(randomToken(16), ARGON);
    const ok = await argon2
      .verify(user?.passwordHash ?? (await dummyHash), input.password)
      .catch(() => false);
    if (!user || !user.passwordHash || !ok || user.status === 'DELETED') {
      if (!demo) await this.redis.multi().incr(lockKey).expire(lockKey, LOGIN_LOCK_SEC, 'NX').exec();
      // 응답을 기다리게 하지 않는다 — 계정 유무에 따라 응답 시간이 달라지지 않게 (record 는 던지지 않는다)
      if (user && user.status !== 'DELETED')
        void this.security.record(user.id, 'LOGIN_FAILED', { ip: client.ip, device: input.device.name });
      throw new AppException('INVALID_CREDENTIALS');
    }
    if (user.status === 'SUSPENDED')
      throw new AppException(
        'ACCOUNT_RESTRICTED',
        user.statusReason ? `이용이 제한된 계정입니다. 사유: ${user.statusReason}` : undefined,
      );
    await this.redis.del(lockKey);
    const issued = await this.sessions.issue(user, input.device, client);
    return { user, issued, platform: input.device.platform };
  }

  // ───── 비밀번호 ─────

  async resetPassword(input: ResetPasswordInput, client: ClientInfo) {
    const email = await this.consumeVerification(input.verificationToken, 'RESET_PASSWORD');
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'DELETED') throw new AppException('INVALID_TOKEN');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await AuthService.hashPassword(input.newPassword) },
    });
    await this.redis.del(`login:fail:${email}`);
    await this.sessions.revokeAll(user.id);
    await this.security.record(user.id, 'PASSWORD_CHANGED', { ip: client.ip }, { via: 'reset' });
  }

  async changePassword(userId: string, sessionId: string, input: ChangePasswordInput, ctx: EventContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // 소셜 전용 계정은 현재 비밀번호 없이 처음 비밀번호를 설정할 수 있다
    if (user.passwordHash) {
      const ok = await argon2.verify(user.passwordHash, input.currentPassword).catch(() => false);
      if (!ok)
        throw new AppException('INVALID_CREDENTIALS', '현재 비밀번호가 올바르지 않습니다.', undefined, 400);
    }
    if (input.newPassword === input.currentPassword) {
      throw new AppException('VALIDATION_FAILED', '현재 비밀번호와 다른 비밀번호를 입력해주세요.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(input.newPassword) },
    });
    // 다른 기기는 로그아웃, 현재 기기는 유지
    await this.sessions.revokeAll(userId, await this.sessions.familyOf(sessionId));
    await this.security.record(userId, 'PASSWORD_CHANGED', ctx, { via: 'change' });
  }

  // ───── 민감 작업 재인증 (docs/SECURITY.md §계정 보안) ─────

  /** 로그인한 계정의 이메일로 재인증 인증번호를 보낸다 */
  async sendReauthCode(userId: string): Promise<{ retryAfterSec: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    // 이메일을 주지 않은 소셜 계정의 내부 주소로는 보낼 수 없다
    if (user.email.endsWith('.invalid'))
      throw new AppException(
        'VALIDATION_FAILED',
        '이메일 인증을 쓸 수 없는 계정입니다. 다른 방법으로 확인해주세요.',
      );
    if (!(await this.redis.set(`otp:gap:REAUTH:${user.email}`, '1', 'EX', 60, 'NX'))) {
      throw new AppException('RATE_LIMITED', '인증번호는 1분에 한 번만 요청할 수 있습니다.');
    }
    await this.limiter.assert(`otp:${user.email}`, 5, 3600);
    await this.issueCode(user.email, 'REAUTH');
    return { retryAfterSec: 60 };
  }

  /** 비밀번호 · 이메일 OTP · 생체 키 중 하나로 본인을 다시 확인하고 5분짜리 재인증 토큰을 준다 */
  async reauth(user: AuthUser, input: ReauthInput, ip: string): Promise<ReauthResult> {
    const session = await this.security.liveSession(user);
    if (!session) throw new AppException('INVALID_TOKEN');
    const ctx: EventContext = { ip, device: session.deviceName, sessionId: session.familyId };
    const fail = async (err: AppException = new AppException('REAUTH_FAILED')) => {
      await this.security.record(user.id, 'REAUTH_FAILED', ctx, { method: input.method });
      return err;
    };

    if (input.method === 'password') {
      const row = await this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      // 비밀번호가 없는 계정도 같은 시간이 걸리게 더미 해시로 검증한다
      dummyHash ??= argon2.hash(randomToken(16), ARGON);
      const ok = await argon2
        .verify(row.passwordHash ?? (await dummyHash), input.password)
        .catch(() => false);
      if (!row.passwordHash || !ok) throw await fail();
    } else if (input.method === 'otp') {
      const row = await this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { email: true },
      });
      try {
        await this.consumeCode(row.email, 'REAUTH', input.code);
      } catch (e) {
        if (!(e instanceof AppException)) throw e;
        throw await fail(e);
      }
    } else if (!(await this.security.verifyBiometric(user.id, session.familyId, input.keyId, input.secret))) {
      throw await fail();
    }

    await this.security.record(user.id, 'REAUTH', ctx, { method: input.method });
    return signReauthToken({ userId: user.id, sessionId: user.sessionId, familyId: session.familyId });
  }

  // ───── 탈퇴 (가입의 짝) ─────

  async deleteAccount(userId: string, input: DeleteAccountInput) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (input.password) {
      const ok =
        user.passwordHash && (await argon2.verify(user.passwordHash, input.password).catch(() => false));
      if (!ok) throw new AppException('INVALID_CREDENTIALS', '비밀번호가 올바르지 않습니다.', undefined, 400);
    } else if (input.verificationToken) {
      const email = await this.consumeVerification(input.verificationToken, 'DELETE_ACCOUNT');
      if (email !== user.email) throw new AppException('INVALID_TOKEN');
    } else if (input.provider) {
      // 비밀번호도 실제 이메일도 없는 소셜 가입자(…@social.invalid)는 연결된 소셜 계정으로 확인한다
      await this.oauth.assertOwnership(userId, { ...input, provider: input.provider });
    } else {
      throw new AppException('VALIDATION_FAILED');
    }

    const [orders, auctions, highest] = await Promise.all([
      this.prisma.order.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          status: { in: [...ACTIVE_TRADE_STATUSES] },
        },
      }),
      this.prisma.auction.count({ where: { sellerId: userId, status: { in: ['SCHEDULED', 'LIVE'] } } }),
      this.prisma.auction.count({ where: { highestBidderId: userId, status: 'LIVE' } }),
    ]);
    if (orders || auctions || highest)
      throw new AppException('ACCOUNT_HAS_ACTIVE_TRADES', undefined, undefined, 409);

    // Apple 로그인 연동은 탈퇴 시 폐기한다 (App Store 5.1.1(v)) — 연결 행을 지우기 전에 토큰을 읽어 둔다
    const appleTokens = await this.oauth.appleTokensOf(userId);

    // 거래·리뷰 기록은 법적 보관 의무와 상대방 기록 보존을 위해 익명 상태로 남긴다 (docs/AUTH.md §7)
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          email: `deleted+${userId}@invalid`,
          passwordHash: null,
          ciHash: null,
          verifiedNameMasked: null,
          phoneMasked: null,
          marketingOptIn: false,
          marketingAgreedAt: null,
        },
      }),
      this.prisma.profile.update({
        where: { userId },
        data: { nickname: `탈퇴회원_${userId.slice(-8)}`, bio: '', avatarKey: null, region: null },
      }),
      this.prisma.socialAccount.deleteMany({ where: { userId } }),
      this.prisma.pushToken.deleteMany({ where: { userId } }),
      this.prisma.address.deleteMany({ where: { userId } }),
      this.prisma.favorite.deleteMany({ where: { userId } }),
      this.prisma.recentView.deleteMany({ where: { userId } }),
      this.prisma.cartItem.deleteMany({ where: { userId } }),
      this.prisma.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } }),
      this.prisma.product.updateMany({
        where: {
          sellerId: userId,
          deletedAt: null,
          status: { in: ['ACTIVE', 'DRAFT', 'HIDDEN', 'PENDING_REVIEW'] },
        },
        data: { status: 'HIDDEN', deletedAt: new Date() },
      }),
    ]);
    await this.sessions.revokeAll(userId);
    await invalidateUserStatus(this.redis, userId);
    await this.oauth.revoke(appleTokens);
  }
}
