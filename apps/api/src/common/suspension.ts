import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { invalidateUserStatus } from './auth';

/** 정지 상태 판단에 필요한 값만 */
export interface SuspensionState {
  id: string;
  status: string;
  statusReason: string | null;
  suspendedUntil: Date | null;
}

const KST: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/** 남은 기간: 하루 미만은 시간, 그 이상은 일 (올림) */
export function remainingText(until: Date, now = new Date()): string {
  const ms = Math.max(0, until.getTime() - now.getTime());
  if (ms < 86_400_000) return `${Math.max(1, Math.ceil(ms / 3_600_000))}시간`;
  return `${Math.ceil(ms / 86_400_000)}일`;
}

/** 로그인 차단 안내: 기간(또는 영구) + 사유 */
export function suspensionMessage(
  u: Pick<SuspensionState, 'statusReason' | 'suspendedUntil'>,
  now = new Date(),
) {
  const period = u.suspendedUntil
    ? `${u.suspendedUntil.toLocaleString('ko-KR', KST)}까지 (${remainingText(u.suspendedUntil, now)} 남음)`
    : '영구';
  return `이용이 제한된 계정입니다. 기간: ${period}${u.statusReason ? `. 사유: ${u.statusReason}` : ''}`;
}

export const suspensionExpired = (u: Pick<SuspensionState, 'status' | 'suspendedUntil'>, now = new Date()) =>
  u.status === 'SUSPENDED' && !!u.suspendedUntil && u.suspendedUntil <= now;

/**
 * 기간이 지난 정지를 푼다 (로그인 시점·워커). 조건부 UPDATE 라 동시에 불려도 한 번만 풀리고,
 * 그사이 관리자가 기간을 바꿨으면 풀지 않는다. 풀었으면 true
 */
export async function liftExpiredSuspension(
  prisma: PrismaService,
  redis: RedisService,
  u: SuspensionState,
): Promise<boolean> {
  if (!suspensionExpired(u)) return false;
  const r = await prisma.user.updateMany({
    where: { id: u.id, status: 'SUSPENDED', suspendedUntil: { lte: new Date() } },
    data: { status: 'ACTIVE', statusReason: null, suspendedUntil: null },
  });
  if (!r.count) return false;
  await invalidateUserStatus(redis, u.id);
  // 해제 기록은 처리자 없이(시스템) 남긴다
  await prisma.auditLog.create({
    data: {
      action: 'user.suspension_expired',
      targetType: 'USER',
      targetId: u.id,
      before: { status: 'SUSPENDED', until: u.suspendedUntil!.toISOString() },
      after: { status: 'ACTIVE' },
    },
  });
  return true;
}
