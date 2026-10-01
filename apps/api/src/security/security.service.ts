import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, SecurityEvent, SecurityEventType } from '@prisma/client';
import type {
  BiometricKeyResult,
  DeviceInput,
  IntegrityReportInput,
  Page,
  SecurityEventDto,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/auth';
import { maskIp, randomToken, safeEqual, sha256 } from '../common/crypto';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const PAGE = 30;
/** 이 기간 안에 같은 기기(플랫폼 + 기기명)로 로그인한 적이 없으면 새 기기 */
const KNOWN_DEVICE_DAYS = 90;
const INTEGRITY_DEDUPE_SEC = 24 * 3600;
const PLATFORM_LABEL: Record<string, string> = { web: '웹', ios: 'iOS', android: 'Android' };

export interface EventContext {
  ip?: string | null;
  device?: string | null;
  /** 세션 family ID */
  sessionId?: string | null;
}

export interface LiveSession {
  familyId: string;
  platform: string;
  deviceName: string;
}

const toDto = (e: SecurityEvent): SecurityEventDto => ({
  id: e.id,
  type: e.type,
  ip: e.ip ? maskIp(e.ip) : null,
  device: e.device,
  detail: (e.detail as Record<string, unknown> | null) ?? null,
  createdAt: e.createdAt.toISOString(),
});

/**
 * 계정 보안 (docs/SECURITY.md §계정 보안): 보안 이벤트 기록 · 새 기기 로그인 알림 · 생체 재인증 키 · 기기 무결성 신고.
 * 이벤트 기록 실패가 로그인·결제 같은 본 업무를 막으면 안 되므로 record 는 예외를 던지지 않는다.
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async record(userId: string, type: SecurityEventType, ctx: EventContext = {}, detail?: object) {
    try {
      await this.prisma.securityEvent.create({
        data: {
          userId,
          type,
          ip: ctx.ip ?? null,
          device: ctx.device?.slice(0, 80) ?? null,
          sessionId: ctx.sessionId ?? null,
          detail: (detail ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error({ err, type }, 'security event failed');
    }
  }

  /**
   * access 토큰의 세션이 속한 기기(family)가 아직 살아 있는지 DB 로 확인한다.
   * 회전으로 폐기된 행의 access 토큰도 같은 family 가 살아 있으면 유효하다.
   */
  async liveSession(user: AuthUser): Promise<LiveSession | null> {
    const s = await this.prisma.session.findUnique({
      where: { id: user.sessionId },
      select: { userId: true, familyId: true, platform: true, deviceName: true },
    });
    if (!s || s.userId !== user.id) return null;
    const alive = await this.prisma.session.count({
      where: { familyId: s.familyId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return alive ? { familyId: s.familyId, platform: s.platform, deviceName: s.deviceName } : null;
  }

  /** 로그인한 요청의 이벤트 문맥 (IP · 기기명 · family) */
  async contextOf(user: AuthUser, ip: string): Promise<EventContext> {
    const s = await this.prisma.session.findUnique({
      where: { id: user.sessionId },
      select: { familyId: true, deviceName: true },
    });
    return { ip, device: s?.deviceName ?? null, sessionId: s?.familyId ?? null };
  }

  // ───── 로그인 · 새 기기 ─────

  /** 로그인·가입·소셜 로그인 직후. 새 기기면 NEW_DEVICE 기록 + 알림 + 메일 */
  async afterLogin(
    user: { id: string; email: string },
    familyId: string,
    device: DeviceInput,
    client: { ip: string; userAgent: string },
  ) {
    const ctx: EventContext = { ip: client.ip, device: device.name, sessionId: familyId };
    await this.record(user.id, 'LOGIN', ctx, { platform: device.platform });
    try {
      const others = { userId: user.id, familyId: { not: familyId } };
      const [hasHistory, seen] = await Promise.all([
        this.prisma.session.findFirst({ where: others, select: { id: true } }),
        this.prisma.session.findFirst({
          where: {
            ...others,
            platform: device.platform,
            deviceName: device.name,
            createdAt: { gte: new Date(Date.now() - KNOWN_DEVICE_DAYS * 86_400_000) },
          },
          select: { id: true },
        }),
      ]);
      // 첫 로그인(가입 직후 등)은 비교할 기기가 없으므로 알리지 않는다
      if (!hasHistory || seen) return;
      await this.record(user.id, 'NEW_DEVICE', ctx, { platform: device.platform });
      const where = `${device.name} (${PLATFORM_LABEL[device.platform] ?? device.platform})`;
      await this.notifications.notify(user.id, {
        type: 'SECURITY_NEW_DEVICE',
        title: '새 기기에서 로그인했어요',
        body: `${where} · 본인이 아니라면 비밀번호를 바꾸고 기기 관리에서 로그아웃해주세요.`,
        link: '/settings/devices',
      });
      // 소셜 전용 계정의 내부 주소(@social.invalid)·탈퇴 주소로는 보내지 않는다
      if (!user.email.endsWith('.invalid'))
        void this.mail
          .send({
            to: user.email,
            subject: '[화소] 새 기기에서 로그인했어요',
            text: [
              '화소 계정에 새 기기로 로그인했습니다.',
              '',
              `기기: ${where}`,
              `IP: ${maskIp(client.ip)}`,
              `시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
              '',
              '본인이 아니라면 즉시 비밀번호를 변경하고 설정 > 기기 관리에서 해당 기기를 로그아웃해주세요.',
            ].join('\n'),
          })
          .catch((err: unknown) => this.logger.warn({ err }, 'new device mail failed'));
    } catch (err) {
      this.logger.error({ err }, 'new device check failed');
    }
  }

  // ───── 보안 기록 ─────

  async list(userId: string, cursor?: string): Promise<Page<SecurityEventDto>> {
    // 남의 커서를 넣어도 내 기록만 나온다 (커서 행이 내 것이 아니면 처음부터)
    const own = cursor
      ? await this.prisma.securityEvent.findFirst({ where: { id: cursor, userId }, select: { id: true } })
      : null;
    const rows = await this.prisma.securityEvent.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(own ? { cursor: { id: own.id }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE);
    return { items: page.map(toDto), nextCursor: rows.length > PAGE ? page.at(-1)!.id : null };
  }

  // ───── 기기 무결성 (경고만, 차단하지 않는다) ─────

  async reportIntegrity(user: AuthUser, input: IntegrityReportInput, ip: string) {
    const flags = [...new Set(input.flags)].sort();
    if (!flags.length) return;
    const ctx = await this.contextOf(user, ip);
    // 같은 기기·같은 신호 조합은 24시간에 한 번만 남긴다 (앱은 실행·복귀마다 신고한다)
    const key = `integrity:${ctx.sessionId ?? user.sessionId}:${flags.join(',')}`;
    if (!(await this.redis.set(key, '1', 'EX', INTEGRITY_DEDUPE_SEC, 'NX'))) return;
    await this.record(user.id, 'INTEGRITY_WARNING', ctx, {
      platform: input.platform,
      flags,
      appVersion: input.appVersion,
    });
  }

  // ───── 생체 재인증 키 ─────

  /** 현재 기기(family)에 키를 발급한다. 다시 등록하면 이전 키를 대체한다 */
  async registerBiometric(user: AuthUser, deviceName: string, ip: string): Promise<BiometricKeyResult> {
    const session = await this.liveSession(user);
    if (!session) throw new AppException('INVALID_TOKEN');
    const secret = randomToken(32);
    const key = await this.prisma.$transaction(async (tx) => {
      await tx.biometricKey.deleteMany({ where: { familyId: session.familyId } });
      return tx.biometricKey.create({
        data: { userId: user.id, familyId: session.familyId, secretHash: sha256(secret), deviceName },
      });
    });
    await this.record(
      user.id,
      'BIOMETRIC_REGISTERED',
      { ip, device: session.deviceName, sessionId: session.familyId },
      { deviceName },
    );
    return { keyId: key.id, secret };
  }

  async removeBiometric(user: AuthUser, ip: string) {
    const ctx = await this.contextOf(user, ip);
    if (!ctx.sessionId) return;
    const r = await this.prisma.biometricKey.deleteMany({
      where: { userId: user.id, familyId: ctx.sessionId },
    });
    if (r.count) await this.record(user.id, 'BIOMETRIC_REMOVED', ctx);
  }

  /** 키가 이 사용자·이 기기의 것이고 secret 해시가 일치하는지 (상수 시간 비교) */
  async verifyBiometric(userId: string, familyId: string, keyId: string, secret: string): Promise<boolean> {
    const key = await this.prisma.biometricKey.findUnique({ where: { id: keyId } });
    const ok =
      !!key &&
      key.userId === userId &&
      key.familyId === familyId &&
      safeEqual(key.secretHash, sha256(secret));
    if (ok) await this.prisma.biometricKey.update({ where: { id: keyId }, data: { lastUsedAt: new Date() } });
    return ok;
  }
}
