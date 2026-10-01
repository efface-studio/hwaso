import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ADMIN_LINKS,
  ADMIN_NOTIFICATION_TYPE,
  ADMIN_ROLES,
  REPORT_REASON_LABEL,
  REPORT_TARGET_LABEL,
  resolveAdminNotificationPrefs,
  type AdminNotificationKind,
} from '@shop/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from './notifications.service';

/** 같은 종류 알림을 묶는 시간 — 이 안에 다시 생기면 끝날 때 "N건 더"로 한 번만 보낸다 */
const COALESCE_MS = 60_000;

export type PaymentIssue = 'AMOUNT_MISMATCH' | 'WEBHOOK_MISMATCH' | 'PAID_AFTER_CLOSE' | 'REFUND_FAILED';

const PAYMENT_ISSUE_TEXT: Record<PaymentIssue, { title: string; body: string }> = {
  AMOUNT_MISMATCH: { title: '결제 금액 불일치', body: '승인 금액이 주문 금액과 달라 결제를 취소했어요.' },
  WEBHOOK_MISMATCH: { title: '결제 웹훅 불일치', body: 'PG 조회 결과가 결제 기록과 달라 반영하지 않았어요.' },
  PAID_AFTER_CLOSE: {
    title: '취소된 주문에 결제 완료',
    body: '주문이 닫힌 뒤 결제가 완료되어 자동 환불했어요.',
  },
  REFUND_FAILED: { title: '환불 실패', body: 'PG 환불 요청이 실패했어요. 결제 상태를 확인해주세요.' },
};

export interface AdminAlert {
  kind: AdminNotificationKind;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** 일으킨 사람 — 관리자 본인이면 받지 않는다 */
  actorId?: string | null;
  /**
   * 같은 key 는 COALESCE_MS 안에 한 번만 보낸다. summary 가 있으면 그동안 생긴 건수를 끝날 때 한 번에 알린다.
   * summary 가 없으면 중복(같은 OTA 의 iOS·Android 배포 등)으로 보고 버린다.
   */
  coalesce?: { key: string; summary?: (more: number) => { title: string; body: string } };
}

/**
 * 관리자 알림: 활성 관리자(ADMIN·SUPER_ADMIN) 전원에게 알림함 + 푸시.
 * 관리자별 설정(notificationPrefs.admin)에서 끈 종류는 알림함에도 남기지 않는다.
 * 실패는 본 업무를 막지 않도록 로그로만 남긴다.
 */
@Injectable()
export class AdminNotifier implements OnModuleDestroy {
  private readonly logger = new Logger(AdminNotifier.name);
  /** 테스트에서 줄일 수 있게 인스턴스 값으로 둔다 */
  coalesceMs = COALESCE_MS;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly n: NotificationsService,
  ) {}

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /** 이 종류를 받겠다고 한 활성 관리자 (일으킨 사람 제외) */
  async recipients(kind: AdminNotificationKind, exclude?: string | null): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [...ADMIN_ROLES] }, status: 'ACTIVE' },
      select: { id: true, notificationPrefs: true },
    });
    return admins
      .filter((a) => a.id !== exclude)
      .filter((a) => {
        const p = resolveAdminNotificationPrefs((a.notificationPrefs as { admin?: unknown } | null)?.admin);
        return p.enabled && p.types[kind];
      })
      .map((a) => a.id);
  }

  async send(alert: AdminAlert) {
    try {
      const c = alert.coalesce;
      if (c) {
        const key = `notify:admin:${alert.kind}:${c.key}`;
        const first = await this.redis.set(key, '1', 'PX', this.coalesceMs, 'NX');
        if (!first) {
          if (c.summary)
            await this.redis
              .multi()
              .incr(`${key}:more`)
              .pexpire(`${key}:more`, this.coalesceMs * 2)
              .exec();
          return;
        }
        if (c.summary) this.scheduleSummary(alert, key, c.summary);
      }
      await this.deliver(alert);
    } catch (err) {
      this.logger.error({ err, kind: alert.kind }, 'admin notify failed');
    }
  }

  private scheduleSummary(
    alert: AdminAlert,
    key: string,
    summary: (more: number) => { title: string; body: string },
  ) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void (async () => {
        const more = Number((await this.redis.getdel(`${key}:more`)) ?? 0);
        if (more > 0) await this.deliver({ kind: alert.kind, ...summary(more) });
      })().catch((err: unknown) => this.logger.error({ err, kind: alert.kind }, 'admin summary failed'));
    }, this.coalesceMs);
    timer.unref();
    this.timers.add(timer);
  }

  /** 링크는 종류별 웹 관리자 목록 — 앱은 toAppPath 로 앱 관리자 화면에 연다 */
  private async deliver(alert: Pick<AdminAlert, 'kind' | 'title' | 'body' | 'data' | 'actorId'>) {
    const to = await this.recipients(alert.kind, alert.actorId);
    await this.n.notify(to, {
      type: ADMIN_NOTIFICATION_TYPE[alert.kind],
      title: alert.title,
      body: alert.body,
      link: ADMIN_LINKS[alert.kind].web,
      data: { admin: alert.kind, ...alert.data },
      threadId: `admin-${alert.kind}`,
    });
  }

  // ───── 도메인 이벤트 ─────

  /** 신고 접수 — 같은 대상의 처리 전 신고가 여럿이면 누적 건수를 함께 */
  async reportFiled(reportId: string) {
    const r = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { reporterId: true, targetType: true, targetId: true, reason: true },
    });
    if (!r) return;
    const open = await this.prisma.report.count({
      where: { targetType: r.targetType, targetId: r.targetId, status: { in: ['OPEN', 'IN_REVIEW'] } },
    });
    await this.send({
      kind: 'report',
      title: '신고가 접수되었어요',
      body: `${REPORT_TARGET_LABEL[r.targetType]} · ${REPORT_REASON_LABEL[r.reason]}${open > 1 ? ` · 같은 대상 누적 ${open}건` : ''}`,
      data: { reportId, targetType: r.targetType, targetId: r.targetId },
      actorId: r.reporterId,
      coalesce: {
        key: 'all',
        summary: (more) => ({
          title: `신고 ${more}건이 더 접수되었어요`,
          body: '신고 목록에서 확인해주세요.',
        }),
      },
    });
  }

  /** 판매자 등록 = 판매자 인증 신청 (관리자가 정산 정보를 보고 인증한다) */
  async sellerRegistered(userId: string) {
    const p = await this.prisma.profile.findUnique({ where: { userId }, select: { nickname: true } });
    await this.send({
      kind: 'seller',
      title: '판매자 인증 신청이 들어왔어요',
      body: `${p?.nickname ?? '회원'}님이 판매자로 등록했어요. 정산 정보를 확인하고 인증해주세요.`,
      data: { userId },
      actorId: userId,
      coalesce: {
        key: 'all',
        summary: (more) => ({
          title: `판매자 인증 신청 ${more}건이 더 들어왔어요`,
          body: '판매자 인증 목록에서 확인해주세요.',
        }),
      },
    });
  }

  /** 감정서 등록·변경 → 검수 대기 */
  async certificateSubmitted(productId: string) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { title: true, sellerId: true, certificate: { select: { issuer: true } } },
    });
    if (!p?.certificate) return;
    await this.send({
      kind: 'certificate',
      title: '감정서 검수 요청이 들어왔어요',
      body: `${p.title} · ${p.certificate.issuer}`,
      data: { productId },
      actorId: p.sellerId,
      coalesce: {
        key: 'all',
        summary: (more) => ({
          title: `감정서 검수 요청 ${more}건이 더 들어왔어요`,
          body: '검수 대기 작품 목록에서 확인해주세요.',
        }),
      },
    });
  }

  /** 결제 이상 — 같은 결제·같은 이상은 한 번만 */
  async paymentIssue(paymentId: string, issue: PaymentIssue) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { amount: true, order: { select: { orderNumber: true } } },
    });
    if (!p) return;
    const text = PAYMENT_ISSUE_TEXT[issue];
    await this.send({
      kind: 'payment',
      title: text.title,
      body: `주문 ${p.order.orderNumber} · ${text.body}`,
      data: { paymentId, issue },
      coalesce: { key: `${issue}:${paymentId}` },
    });
  }

  /** OTA 배포·되돌리기. 같은 묶음(iOS·Android 동시 배포)은 한 번만 */
  async appUpdate(
    u: { kind: string; runtimeVersion: string; channel: string; message: string; critical: boolean },
    opts: { rollback?: boolean; actorId?: string | null } = {},
  ) {
    const { rollback = false, actorId } = opts;
    await this.send({
      kind: 'appUpdate',
      title: rollback ? '앱 업데이트를 되돌렸어요' : '앱 업데이트가 배포되었어요',
      body: [u.message || '설명 없음', `런타임 ${u.runtimeVersion}`, u.channel, u.critical ? '필수' : null]
        .filter(Boolean)
        .join(' · '),
      data: { runtimeVersion: u.runtimeVersion, channel: u.channel },
      actorId,
      coalesce: { key: `${u.kind}:${u.runtimeVersion}:${u.channel}:${u.message}` },
    });
  }
}
