import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthTokens, DeviceInput, MeDto, SessionDto } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { ACCESS_TOKEN_TTL_SEC, invalidateUserStatus, signAccessToken } from '../common/auth';
import { maskIp, randomToken, sha256 } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const REFRESH_TTL_DAYS = 30;

export interface ClientInfo {
  ip: string;
  userAgent: string;
}

/**
 * Refresh 토큰 회전 (docs/AUTH.md §1).
 * 토큰마다 Session 행을 하나 쓰고 같은 familyId 로 묶는다. 회전하면 이전 행을 폐기하고 새 행을 만든다.
 * 이미 폐기된 토큰이 다시 오면 탈취로 보고 family 전체를 폐기한다.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async issue(
    user: Pick<User, 'id' | 'role'>,
    device: DeviceInput,
    client: ClientInfo,
    familyId?: string,
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    const refreshToken = randomToken(32);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        familyId: familyId ?? randomToken(16),
        deviceName: device.name,
        platform: device.platform,
        ip: client.ip,
        userAgent: client.userAgent.slice(0, 300),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    const accessToken = await signAccessToken({ id: user.id, role: user.role, sessionId: session.id });
    return { accessToken, refreshToken, sessionId: session.id };
  }

  async rotate(refreshToken: string, client: ClientInfo) {
    const hash = sha256(refreshToken);
    const s = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
    if (!s) throw new AppException('INVALID_TOKEN');
    if (s.revokedAt) {
      // 재사용 탐지: 이미 회전된 토큰 → 같은 family 전부 폐기
      await this.prisma.session.updateMany({
        where: { familyId: s.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppException('INVALID_TOKEN');
    }
    if (s.expiresAt < new Date() || s.user.status !== 'ACTIVE') throw new AppException('INVALID_TOKEN');

    // 동시 요청이 같은 토큰으로 두 번 회전하지 못하게 조건부 폐기
    const revoked = await this.prisma.session.updateMany({
      where: { id: s.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    if (!revoked.count) throw new AppException('INVALID_TOKEN');
    const next = await this.issue(
      s.user,
      { name: s.deviceName, platform: s.platform as DeviceInput['platform'] },
      client,
      s.familyId,
    );
    return { ...next, user: s.user, platform: s.platform };
  }

  async revokeByRefresh(refreshToken: string) {
    const s = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (s) await this.revokeFamily(s.familyId);
  }

  async revokeFamily(familyId: string) {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async familyOf(sessionId: string): Promise<string | null> {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { familyId: true } });
    return s?.familyId ?? null;
  }

  /** 비밀번호 변경·재설정·정지 시 (현재 기기 제외 가능) */
  async revokeAll(userId: string, exceptFamily?: string | null) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptFamily ? { familyId: { not: exceptFamily } } : {}) },
      data: { revokedAt: new Date() },
    });
    await invalidateUserStatus(this.redis, userId);
  }

  /** 기기 목록 = 살아 있는 family 별 최신 세션 */
  async list(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const currentFamily = await this.familyOf(currentSessionId);
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.familyId) ? false : (seen.add(r.familyId), true)))
      .map((r) => ({
        id: r.familyId,
        deviceName: r.deviceName,
        platform: r.platform,
        ipMasked: maskIp(r.ip),
        lastUsedAt: r.createdAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        current: r.familyId === currentFamily,
      }));
  }

  async me(userId: string): Promise<MeDto> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        seller: { select: { userId: true } },
        socialAccounts: { select: { provider: true } },
      },
    });
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      emailVerified: !!u.emailVerifiedAt,
      hasPassword: !!u.passwordHash,
      isSeller: !!u.seller,
      identityVerified: !!u.identityVerifiedAt,
      isAdult: u.isAdult,
      socialProviders: u.socialAccounts.map((s) => s.provider),
      profile: {
        nickname: u.profile?.nickname ?? '',
        bio: u.profile?.bio ?? '',
        avatarKey: u.profile?.avatarKey ?? null,
        region: u.profile?.region ?? null,
      },
    };
  }

  async tokens(
    user: Pick<User, 'id' | 'role'>,
    issued: { accessToken: string; refreshToken: string },
    includeRefresh: boolean,
  ): Promise<AuthTokens & { refreshToken?: string }> {
    return {
      accessToken: issued.accessToken,
      refreshToken: includeRefresh ? issued.refreshToken : undefined,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      user: await this.me(user.id),
    };
  }
}
