import { Injectable, Logger } from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';
import type { ConfirmPaymentInput, PaymentRequestDto, PreparePaymentInput } from '@shop/shared';
import type { AuthUser } from '../common/auth';
import { AppException } from '../common/app-exception';
import { AdminNotifier, type PaymentIssue } from '../notifications/admin-notifier';
import { logNotifyError, NotificationEvents } from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime';
import { addressSnapshot } from './cart.service';
import { lockOrder, markPaid, type LockedOrder } from './order-state';
import { mockPayment, mockPaymentsAllowed, TossClient, type TossPayment } from './toss.client';

/** 즉시 구매 주문을 가상계좌로 결제하면 입금 기간만큼 재고 예약을 늘린다 */
const VIRTUAL_ACCOUNT_HOURS = 24;

/**
 * 결제 (docs/API.md "Cart / Orders / Payments"). 결제 금액은 항상 서버의 주문 금액이며,
 * 클라이언트·PG 가 돌려준 금액은 대조에만 쓴다. PG 호출은 트랜잭션 밖에서 하고 결과 반영만 잠금 안에서 한다.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toss: TossClient,
    private readonly realtime: RealtimeService,
    private readonly events: NotificationEvents,
    private readonly admins: AdminNotifier,
  ) {}

  private provider(): 'toss' | 'mock' {
    if (this.toss.enabled()) return 'toss';
    if (mockPaymentsAllowed()) return 'mock';
    throw new AppException('PAYMENT_NOT_CONFIGURED', undefined, undefined, 503);
  }

  /** 상태 변경 후: 양쪽 화면 갱신 + 받는 사람별 알림 */
  notify(order: {
    id: string;
    status: OrderStatus;
    buyerId: string;
    sellerId: string;
    items: { titleSnapshot: string }[];
  }) {
    for (const uid of [order.buyerId, order.sellerId])
      this.realtime.toUser(uid, 'ORDER_STATUS_UPDATED', { orderId: order.id, status: order.status });
    void this.events.orderChanged(order).catch(logNotifyError);
  }

  async prepare(user: AuthUser, orderId: string, input: PreparePaymentInput): Promise<PaymentRequestDto> {
    const provider = this.provider();
    const { order, payment, recipient } = await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.buyerId !== user.id) throw new AppException('NOT_FOUND');
      if (order.status !== 'PAYMENT_PENDING') throw new AppException('INVALID_TRANSITION');
      if (order.paymentDueAt && order.paymentDueAt <= new Date())
        throw new AppException('PAYMENT_EXPIRED', undefined, undefined, 409);
      if (order.payments.some((p) => p.status === 'READY' && p.providerPaymentKey))
        throw new AppException(
          'CONFLICT',
          '입금 대기 중인 가상계좌가 있습니다. 입금하거나 주문을 취소한 뒤 다시 시도해주세요.',
        );

      let shippingAddress = order.shippingAddress;
      if (input.addressId) {
        const a = await tx.address.findFirst({ where: { id: input.addressId, userId: user.id } });
        if (!a) throw new AppException('ADDRESS_REQUIRED');
        shippingAddress = addressSnapshot(a) as object;
      }
      if (!shippingAddress) throw new AppException('ADDRESS_REQUIRED');

      const paymentDueAt =
        input.method === 'VIRTUAL_ACCOUNT' && order.source === 'DIRECT'
          ? new Date(Date.now() + VIRTUAL_ACCOUNT_HOURS * 3_600_000)
          : order.paymentDueAt;
      await tx.order.update({ where: { id: order.id }, data: { shippingAddress, paymentDueAt } });
      order.paymentDueAt = paymentDueAt;
      const payment = await tx.payment.create({
        data: { orderId: order.id, provider, method: input.method, amount: order.totalAmount },
      });
      return { order, payment, recipient: (shippingAddress as { recipient: string }).recipient };
    });
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
    const first = order.items[0]!.titleSnapshot;
    return {
      paymentId: payment.id,
      provider,
      clientKey: provider === 'toss' ? this.toss.clientKey() : null,
      customerKey: `c_${user.id}`,
      orderName: (order.items.length > 1 ? `${first} 외 ${order.items.length - 1}건` : first).slice(0, 100),
      amount: Number(payment.amount),
      method: payment.method,
      customerEmail: u.email.endsWith('@invalid') ? null : u.email,
      customerName: recipient,
      dueAt: order.paymentDueAt?.toISOString() ?? null,
    };
  }

  /** 결제 승인. 같은 요청이 여러 번 와도 한 번만 승인·반영된다 */
  async confirm(user: AuthUser, input: ConfirmPaymentInput): Promise<{ orderId: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { order: true },
    });
    if (!payment || payment.order.buyerId !== user.id) throw new AppException('NOT_FOUND');
    if (payment.providerPaymentKey === input.paymentKey && payment.status !== 'FAILED')
      return { orderId: payment.orderId };
    if (payment.status !== 'READY' || payment.providerPaymentKey)
      throw new AppException('INVALID_TRANSITION');
    if (payment.provider === 'mock' && !mockPaymentsAllowed())
      throw new AppException('PAYMENT_NOT_CONFIGURED', undefined, undefined, 503);

    const order = payment.order;
    if (input.amount !== Number(payment.amount) || payment.amount !== order.totalAmount) {
      // 승인하지 않으면 카드 인증만 된 상태로 자동 소멸한다
      await this.fail(payment.id, 'AMOUNT_MISMATCH');
      throw new AppException('PAYMENT_AMOUNT_MISMATCH');
    }
    if (order.status !== 'PAYMENT_PENDING' || (order.paymentDueAt && order.paymentDueAt <= new Date())) {
      await this.fail(payment.id, 'ORDER_NOT_PAYABLE');
      throw new AppException('PAYMENT_EXPIRED', undefined, undefined, 409);
    }

    let result: TossPayment;
    try {
      result =
        payment.provider === 'toss'
          ? await this.toss.confirm(input.paymentKey, payment.id, input.amount, `confirm-${payment.id}`)
          : mockPayment(payment.id, input.paymentKey, input.amount, payment.method === 'VIRTUAL_ACCOUNT');
    } catch (e) {
      const code = e instanceof AppException ? String(e.details?.providerCode ?? e.code) : 'NETWORK';
      await this.fail(payment.id, code);
      throw e;
    }
    if (result.totalAmount !== input.amount || result.orderId !== payment.id) {
      await this.cancelAtProvider(
        payment.provider,
        input.paymentKey,
        '결제 금액 불일치',
        `mismatch-${payment.id}`,
      );
      await this.fail(payment.id, 'AMOUNT_MISMATCH');
      this.alert(payment.id, 'AMOUNT_MISMATCH');
      throw new AppException('PAYMENT_AMOUNT_MISMATCH');
    }
    await this.apply(payment.id, result);
    return { orderId: payment.orderId };
  }

  /** PG 쪽 결제 이상은 관리자에게 알린다 (응답을 기다리지 않음). 승인 전 요청 금액 불일치는 돈이 움직이지 않아 알리지 않는다 */
  private alert(paymentId: string, issue: PaymentIssue) {
    void this.admins.paymentIssue(paymentId, issue).catch(logNotifyError);
  }

  private fail(paymentId: string, code: string) {
    return this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'READY' },
      data: { status: 'FAILED', failureCode: code.slice(0, 60) },
    });
  }

  private async cancelAtProvider(provider: string, paymentKey: string, reason: string, key: string) {
    if (provider === 'toss') await this.toss.cancel(paymentKey, reason, key);
  }

  /**
   * PG 결제 상태를 주문에 반영 (승인 응답·웹훅 공통).
   * 입금 확인이 주문 취소 뒤에 도착하면 자동으로 환불한다.
   */
  async apply(paymentId: string, p: TossPayment) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const { orderId } = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        select: { orderId: true },
      });
      const order = await lockOrder(tx, orderId);
      const payment = order.payments.find((x) => x.id === paymentId)!;
      const base = { providerPaymentKey: p.paymentKey, raw: p as object };
      const none = { order, changed: false, refund: false };

      if (p.status === 'WAITING_FOR_DEPOSIT') {
        if (payment.status === 'READY') await tx.payment.update({ where: { id: paymentId }, data: base });
        return none;
      }
      if (p.status === 'DONE') {
        if (payment.status === 'DONE') return none;
        const approvedAt = p.approvedAt ? new Date(p.approvedAt) : new Date();
        await tx.payment.update({ where: { id: paymentId }, data: { ...base, status: 'DONE', approvedAt } });
        payment.status = 'DONE';
        payment.providerPaymentKey = p.paymentKey;
        if (order.status !== 'PAYMENT_PENDING') return { ...none, refund: true };
        await markPaid(tx, order, approvedAt);
        return { ...none, changed: true };
      }
      if (p.status === 'CANCELED' || p.status === 'PARTIAL_CANCELED') {
        const status =
          p.balanceAmount > 0 ? 'PARTIAL_REFUNDED' : payment.status === 'DONE' ? 'REFUNDED' : 'CANCELLED';
        await tx.payment.update({
          where: { id: paymentId },
          data: { ...base, status, cancelledAmount: BigInt(p.totalAmount - p.balanceAmount) },
        });
        return none;
      }
      if ((p.status === 'EXPIRED' || p.status === 'ABORTED') && payment.status === 'READY')
        await tx.payment.update({
          where: { id: paymentId },
          data: { ...base, status: 'FAILED', failureCode: p.status },
        });
      return none;
    });

    if (outcome.refund) {
      this.logger.warn({ paymentId }, 'payment completed for a closed order — auto refund');
      this.alert(paymentId, 'PAID_AFTER_CLOSE');
      await this.refundPayment(outcome.order, '주문이 취소된 뒤 결제가 완료되어 자동 환불');
    }
    if (outcome.changed) this.notify(outcome.order);
  }

  /** 결제 완료 건 전액 환불 (PG 먼저, 멱등 키). 입금 전 가상계좌는 발급을 취소한다 */
  async refundPayment(order: LockedOrder, reason: string) {
    const payment = order.payments.find((p) => p.status === 'DONE');
    if (payment?.providerPaymentKey) {
      try {
        await this.cancelAtProvider(
          payment.provider,
          payment.providerPaymentKey,
          reason,
          `refund-${payment.id}`,
        );
      } catch (err) {
        this.logger.error({ err, paymentId: payment.id }, 'refund failed');
        this.alert(payment.id, 'REFUND_FAILED');
        throw new AppException('REFUND_FAILED', undefined, undefined, 502);
      }
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED', cancelledAmount: payment.amount },
        }),
        this.prisma.refund.create({
          data: { paymentId: payment.id, amount: payment.amount, reason: reason.slice(0, 500) },
        }),
      ]);
    }
    const waiting = order.payments.find((p) => p.status === 'READY' && p.providerPaymentKey);
    if (waiting) {
      await this.cancelAtProvider(
        waiting.provider,
        waiting.providerPaymentKey!,
        reason,
        `void-${waiting.id}`,
      ).catch((err: unknown) =>
        this.logger.warn({ err, paymentId: waiting.id }, 'virtual account void failed'),
      );
      await this.prisma.payment.update({ where: { id: waiting.id }, data: { status: 'CANCELLED' } });
    }
  }

  /**
   * 토스페이먼츠 웹훅. 본문은 믿지 않고 paymentKey 로 PG 에서 다시 조회해 반영한다.
   * PAYMENT_STATUS_CHANGED 와 가상계좌 DEPOSIT_CALLBACK 모두 orderId(= 우리 결제 ID)를 담고 있다.
   */
  async webhook(body: unknown) {
    const b = (body ?? {}) as { data?: { paymentKey?: unknown; orderId?: unknown }; orderId?: unknown };
    const paymentId = b.data?.orderId ?? b.orderId;
    if (typeof paymentId !== 'string' || paymentId.length > 64) return { ok: true };
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.provider !== 'toss') return { ok: true };
    const key =
      payment.providerPaymentKey ?? (typeof b.data?.paymentKey === 'string' ? b.data.paymentKey : null);
    if (!key) return { ok: true };
    const fetched = await this.toss.get(key);
    if (fetched.orderId !== payment.id || fetched.totalAmount !== Number(payment.amount)) {
      this.logger.error({ paymentId }, 'webhook payment mismatch');
      this.alert(payment.id, 'WEBHOOK_MISMATCH');
      return { ok: true };
    }
    await this.apply(payment.id, fetched);
    return { ok: true };
  }

  /** 개발용: 모의 가상계좌 입금 */
  async mockDeposit(user: AuthUser, paymentId: string) {
    if (!mockPaymentsAllowed()) throw new AppException('NOT_FOUND');
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (
      !payment ||
      payment.provider !== 'mock' ||
      payment.order.buyerId !== user.id ||
      !payment.providerPaymentKey
    )
      throw new AppException('NOT_FOUND');
    await this.apply(
      payment.id,
      mockPayment(payment.id, payment.providerPaymentKey, Number(payment.amount), false),
    );
    return { orderId: payment.orderId };
  }
}
