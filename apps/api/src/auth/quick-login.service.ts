import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  QUICK_LOGIN_TTL_DAYS,
  type QuickLoginCredentialResult,
  type QuickLoginInput,
  type QuickLoginRegisterInput,
  type QuickLoginStatusDto,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import { type AuthUser, verifyReauthToken } from '../common/auth';
import { randomToken, safeEqual, sha256 } from '../common/crypto';
import { RateLimitService } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { type LiveSession, SecurityService } from '../security/security.service';
import { type ClientInfo, SessionService } from './session.service';

/** 로그인한 지 이 시간 안이면 본인 확인 없이 켤 수 있다 (로그인 직후 한 번 묻는 안내) */
export const QUICK_LOGIN_FRESH_MS = 10 * 60_000;
/** 연속 실패가 이만큼이면 자격을 폐기한다 */
export const QUICK_LOGIN_MAX_FAILURES = 5;
/** 자격 하나로 시도할 수 있는 횟수 (IP 제한과 별도) */
const PER_CREDENTIAL_LIMIT = { limit: 10, windowSec: 600 };
const TTL_MS = QUICK_LOGIN_TTL_DAYS * 86_400_000;

const invalid = () => new AppException('QUICK_LOGIN_INVALID');

/**
 * Face ID·지문 빠른 로그인 (docs/AUTH.md §9).
 * 비밀번호를 기기에 두지 않고, 서버가 만든 32바이트 secret 을 앱이 생체 인증 보호 키체인에 둔다.
 * 서버에는 SHA-256 만 저장하고, 로그인에 쓰면 secret 을 바꿔(1회용) 다시 내려준다.
 */
@Injectable()
export class QuickLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly security: SecurityService,
    private readonly limiter: RateLimitService,
  ) {}

  /** 로그인한 지 10분 안의 기기 세션인지 (family 의 첫 세션 시각) */
  private async isFresh(familyId: string): Promise<boolean> {
    const first = await this.prisma.session.findFirst({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return !!first && Date.now() - first.createdAt.getTime() < QUICK_LOGIN_FRESH_MS;
  }

  private async liveAppSession(user: AuthUser): Promise<LiveSession> {
    const session = await this.security.liveSession(user);
    if (!session) throw new AppException('INVALID_TOKEN');
    // 생체 인증이 없는 웹 세션은 켤 수 없다
    if (session.platform !== 'ios' && session.platform !== 'android') throw new AppException('FORBIDDEN');
    return session;
  }

  /**
   * 이 기기(앱 설치)에 자격을 발급한다. 다시 켜면 secret 을 새로 만든다.
   * 로그인 직후(10분)가 아니면 재인증 토큰이 있어야 한다 — 훔친 access 토큰으로 오래가는 자격을 만들지 못하게.
   */
  async register(
    user: AuthUser,
    input: QuickLoginRegisterInput,
    reauthToken: string | null,
    ip: string,
  ): Promise<QuickLoginCredentialResult> {
    const session = await this.liveAppSession(user);
    if (!(await this.isFresh(session.familyId))) {
      const claims = reauthToken ? await verifyReauthToken(reauthToken) : null;
      if (!claims || claims.userId !== user.id || !safeEqual(claims.familyId, session.familyId))
        throw new AppException('REAUTH_REQUIRED');
    }
    const secret = randomToken(32);
    const deviceIdHash = sha256(input.deviceId);
    const expiresAt = new Date(Date.now() + TTL_MS);
    const fields = {
      secretHash: sha256(secret),
      prevSecretHash: null,
      familyId: session.familyId,
      deviceName: input.deviceName,
      failures: 0,
      lastUsedAt: null,
      expiresAt,
    };
    const row = await this.prisma.quickLoginCredential.upsert({
      where: { userId_deviceIdHash: { userId: user.id, deviceIdHash } },
      create: { userId: user.id, deviceIdHash, ...fields },
      update: { ...fields, createdAt: new Date() },
    });
    await this.security.record(
      user.id,
      'QUICK_LOGIN_REGISTERED',
      { ip, device: session.deviceName, sessionId: session.familyId },
      { deviceName: input.deviceName },
    );
    return { credentialId: row.id, secret, expiresAt: expiresAt.toISOString() };
  }

  async status(user: AuthUser, deviceId: string): Promise<QuickLoginStatusDto> {
    const row = await this.prisma.quickLoginCredential.findUnique({
      where: { userId_deviceIdHash: { userId: user.id, deviceIdHash: sha256(deviceId) } },
      select: { expiresAt: true },
    });
    const live = !!row && row.expiresAt > new Date();
    return { enabled: live, expiresAt: live ? row.expiresAt.toISOString() : null };
  }

  /**
   * 비밀번호·소셜로 다시 로그인한 기기에 남아 있는 자격을 지금 세션에 다시 묶는다.
   * 그래야 기기 관리의 원격 로그아웃·"다른 기기 로그아웃"이 이 자격을 올바로 찾는다
   */
  async attach(user: AuthUser, deviceId: string): Promise<QuickLoginStatusDto> {
    const session = await this.liveAppSession(user);
    await this.prisma.quickLoginCredential.updateMany({
      where: { userId: user.id, deviceIdHash: sha256(deviceId), expiresAt: { gt: new Date() } },
      data: { familyId: session.familyId },
    });
    return this.status(user, deviceId);
  }

  async remove(user: AuthUser, deviceId: string, ip: string) {
    const r = await this.prisma.quickLoginCredential.deleteMany({
      where: { userId: user.id, deviceIdHash: sha256(deviceId) },
    });
    if (r.count)
      await this.security.record(user.id, 'QUICK_LOGIN_REMOVED', await this.security.contextOf(user, ip));
  }

  /**
   * 빠른 로그인: 자격을 확인하고 새 세션을 만든 뒤 secret 을 바꿔 준다.
   * 실패 사유는 응답에서 구분하지 않는다 (모두 QUICK_LOGIN_INVALID).
   */
  async login(
    input: QuickLoginInput,
    client: ClientInfo,
  ): Promise<{
    user: User;
    issued: Awaited<ReturnType<SessionService['issue']>>;
    quickLogin: QuickLoginCredentialResult;
  }> {
    if (input.device.platform === 'web') throw new AppException('FORBIDDEN');
    await this.limiter.assert(
      `quick:${input.credentialId}`,
      PER_CREDENTIAL_LIMIT.limit,
      PER_CREDENTIAL_LIMIT.windowSec,
    );
    const cred = await this.prisma.quickLoginCredential.findUnique({
      where: { id: input.credentialId },
      include: { user: true },
    });
    if (!cred) throw invalid();
    const ctx = { ip: client.ip, device: input.device.name, sessionId: cred.familyId };

    if (cred.expiresAt <= new Date() || cred.user.status === 'DELETED') {
      await this.prisma.quickLoginCredential.deleteMany({ where: { id: cred.id } });
      throw invalid();
    }

    const secretHash = sha256(input.secret);
    // 이미 바꾼 secret 이 다시 오면 탈취로 본다 — 자격과 그 자격이 만든 기기 세션을 폐기
    if (cred.prevSecretHash && safeEqual(cred.prevSecretHash, secretHash)) {
      await this.prisma.quickLoginCredential.deleteMany({ where: { id: cred.id } });
      await this.sessions.revokeFamily(cred.familyId);
      await this.security.record(cred.userId, 'QUICK_LOGIN_FAILED', ctx, { reason: 'reuse' });
      throw invalid();
    }
    const deviceOk = safeEqual(cred.deviceIdHash, sha256(input.deviceId));
    if (!deviceOk || !safeEqual(cred.secretHash, secretHash)) {
      const failures = cred.failures + 1;
      const locked = failures >= QUICK_LOGIN_MAX_FAILURES;
      if (locked) await this.prisma.quickLoginCredential.deleteMany({ where: { id: cred.id } });
      else
        await this.prisma.quickLoginCredential.updateMany({
          where: { id: cred.id },
          data: { failures: { increment: 1 } },
        });
      await this.security.record(cred.userId, 'QUICK_LOGIN_FAILED', ctx, {
        reason: deviceOk ? 'secret' : 'device',
        locked,
      });
      throw invalid();
    }
    if (cred.user.status === 'SUSPENDED')
      throw new AppException(
        'ACCOUNT_RESTRICTED',
        cred.user.statusReason ? `이용이 제한된 계정입니다. 사유: ${cred.user.statusReason}` : undefined,
      );

    // 새 세션 발급과 secret 교체를 한 트랜잭션으로 — 같은 secret 으로 동시에 와도 하나만 성공한다
    const secret = randomToken(32);
    const expiresAt = new Date(Date.now() + TTL_MS);
    const issued = await this.prisma.$transaction(async (tx) => {
      const next = await this.sessions.issue(cred.user, input.device, client, undefined, tx);
      const swapped = await tx.quickLoginCredential.updateMany({
        where: { id: cred.id, secretHash: cred.secretHash },
        data: {
          secretHash: sha256(secret),
          prevSecretHash: cred.secretHash,
          familyId: next.familyId,
          deviceName: input.device.name,
          failures: 0,
          lastUsedAt: new Date(),
          expiresAt,
        },
      });
      if (!swapped.count) throw invalid();
      return next;
    });
    return {
      user: cred.user,
      issued,
      quickLogin: { credentialId: cred.id, secret, expiresAt: expiresAt.toISOString() },
    };
  }
}
