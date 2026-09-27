import { Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import type {
  AdminCouponRow,
  AdminOrderRow,
  AdminPaymentRow,
  AdminSettlementRow,
  CouponInput,
  Paged,
  PageQuery,
  PaymentMethod,
  PaymentStatus,
  SettlementStatus,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/auth';
import { isUniqueViolation, lockOrder, releaseOrder } from '../orders/order-state';
import { toUserSummary } from '../orders/order.mapper';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../orders/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditContext } from './audit.service';

const userSel = { id: true, profile: { select: { nickname: true, avatarKey: true } } } as const;
const skip = (q: PageQuery) => ({ skip: (q.page - 1) * q.size, take: q.size });

@Injectable()
export class AdminCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  // ───── 주문 ─────

  async orderList(q: PageQuery & { status?: OrderStatus }): Promise<Paged<AdminOrderRow>> {
    const where: Prisma.OrderWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { id: q.q },
              { orderNumber: { contains: q.q.toUpperCase() } },
              { buyer: { profile: { nickname: { contains: q.q } } } },
              { seller: { profile: { nickname: { contains: q.q } } } },
              { items: { some: { titleSnapshot: { contains: q.q } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          buyer: { select: userSel },
          seller: { select: userSel },
          items: { select: { titleSnapshot: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        ...skip(q),
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        source: o.source,
        title: o.items[0]?.titleSnapshot ?? '',
        buyer: toUserSummary(o.buyer),
        seller: toUserSummary(o.seller),
        totalAmount: Number(o.totalAmount),
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }

  /**
   * 관리자 환불: 상태에 맞는 일반 경로(취소·환불 승인)를 먼저 쓰고,
   * 배송 중·배송 완료·구매 확정 이후 분쟁은 전이표를 넘어 환불 처리하고 정산을 보류한다.
   */
  async refund(ctx: AuditContext, id: string, reason: string) {
    const before = await this.prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw new AppException('NOT_FOUND');
    const admin: AuthUser = ctx.user;
    let result;
    if (['PAYMENT_PENDING', 'PAID', 'PREPARING'].includes(before.status)) {
      result = await this.orders.cancel(admin, id, `[운영] ${reason}`);
    } else if (before.status === 'REFUND_REQUESTED') {
      result = await this.orders.refundApprove(admin, id);
    } else if (['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(before.status)) {
      const locked = await this.prisma.$transaction((tx) => lockOrder(tx, id));
      await this.payments.refundPayment(locked, `[운영] ${reason}`);
      const o = await this.prisma.$transaction(async (tx) => {
        const o = await lockOrder(tx, id);
        await tx.orderStatusLog.create({
          data: {
            orderId: id,
            from: o.status,
            to: 'REFUNDED',
            actorId: admin.id,
            reason: `[운영 분쟁 환불] ${reason}`,
          },
        });
        await tx.order.update({ where: { id }, data: { status: 'REFUNDED' } });
        await releaseOrder(tx, o, 'return');
        await tx.settlement.updateMany({
          where: { orderId: id, status: { not: 'PAID' } },
          data: { status: 'HELD' },
        });
        o.status = 'REFUNDED';
        return o;
      });
      this.payments.notify(o);
      result = await this.orders.detail(admin, id);
    } else {
      throw new AppException('INVALID_TRANSITION', '환불할 수 없는 주문 상태입니다.');
    }
    await this.audit.log(
      ctx,
      'order.refund',
      'ORDER',
      id,
      { status: before.status },
      { status: result.status, reason },
    );
    return result;
  }

  // ───── 결제 ─────

  async paymentList(
    q: PageQuery & { status?: PaymentStatus; method?: PaymentMethod },
  ): Promise<Paged<AdminPaymentRow>> {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.method ? { method: q.method } : {}),
      ...(q.q
        ? {
            OR: [
              { id: q.q },
              { providerPaymentKey: q.q },
              { order: { orderNumber: { contains: q.q.toUpperCase() } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { order: { select: { orderNumber: true } } },
        orderBy: { createdAt: 'desc' },
        ...skip(q),
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      items: rows.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        provider: p.provider,
        method: p.method,
        status: p.status,
        amount: Number(p.amount),
        cancelledAmount: Number(p.cancelledAmount),
        failureCode: p.failureCode,
        approvedAt: p.approvedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }

  // ───── 정산 ─────

  async settlementList(q: PageQuery & { status?: SettlementStatus }): Promise<Paged<AdminSettlementRow>> {
    const where: Prisma.SettlementWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { order: { orderNumber: { contains: q.q.toUpperCase() } } },
              { seller: { profile: { nickname: { contains: q.q } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        include: {
          order: { select: { orderNumber: true } },
          seller: { select: { ...userSel, seller: { select: { bankName: true, bankAccountMasked: true } } } },
        },
        orderBy: { scheduledAt: 'asc' },
        ...skip(q),
      }),
      this.prisma.settlement.count({ where }),
    ]);
    return {
      items: rows.map((s) => ({
        id: s.id,
        orderId: s.orderId,
        orderNumber: s.order.orderNumber,
        seller: toUserSummary(s.seller),
        bank: s.seller.seller ? `${s.seller.seller.bankName} ${s.seller.seller.bankAccountMasked}` : null,
        grossAmount: Number(s.grossAmount),
        feeAmount: Number(s.feeAmount),
        netAmount: Number(s.netAmount),
        status: s.status,
        scheduledAt: s.scheduledAt.toISOString(),
        paidAt: s.paidAt?.toISOString() ?? null,
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }

  /** 지급 완료(SCHEDULED/PENDING → PAID) · 보류(→ HELD) · 보류 해제(HELD → SCHEDULED) */
  async settlementAction(ctx: AuditContext, ids: string[], action: 'pay' | 'hold' | 'release') {
    const from: SettlementStatus[] =
      action === 'pay' ? ['PENDING', 'SCHEDULED'] : action === 'hold' ? ['PENDING', 'SCHEDULED'] : ['HELD'];
    const data =
      action === 'pay'
        ? { status: 'PAID' as const, paidAt: new Date() }
        : action === 'hold'
          ? { status: 'HELD' as const }
          : { status: 'SCHEDULED' as const };
    const r = await this.prisma.settlement.updateMany({
      where: { id: { in: ids }, status: { in: from } },
      data,
    });
    for (const id of ids) await this.audit.log(ctx, `settlement.${action}`, 'SETTLEMENT', id, null, data);
    return { updated: r.count };
  }

  // ───── 쿠폰 ─────

  async coupons(q: PageQuery): Promise<Paged<AdminCouponRow>> {
    const where: Prisma.CouponWhereInput = q.q
      ? { OR: [{ code: { contains: q.q.toUpperCase() } }, { name: { contains: q.q } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, ...skip(q) }),
      this.prisma.coupon.count({ where }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        value: Number(c.value),
        minOrderAmount: Number(c.minOrderAmount),
        maxDiscount: c.maxDiscount == null ? null : Number(c.maxDiscount),
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        usageLimit: c.usageLimit,
        isActive: c.isActive,
        usedCount: c.usedCount,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }

  private couponData(input: CouponInput) {
    return {
      ...input,
      value: BigInt(input.value),
      minOrderAmount: BigInt(input.minOrderAmount),
      maxDiscount: input.maxDiscount == null ? null : BigInt(input.maxDiscount),
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    };
  }

  async createCoupon(ctx: AuditContext, input: CouponInput) {
    try {
      const c = await this.prisma.coupon.create({ data: this.couponData(input) });
      await this.audit.log(ctx, 'coupon.create', 'COUPON', c.id, null, input);
      return { id: c.id };
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppException('CONFLICT', '이미 있는 쿠폰 코드입니다.');
      throw e;
    }
  }

  /** 이미 쓰인 쿠폰은 코드·할인 방식을 바꾸지 않는다 (지난 주문 금액과 어긋나지 않게) */
  async updateCoupon(ctx: AuditContext, id: string, input: CouponInput) {
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    if (
      before.usedCount > 0 &&
      (before.code !== input.code || before.type !== input.type || Number(before.value) !== input.value)
    )
      throw new AppException(
        'CONFLICT',
        '사용된 쿠폰은 코드·할인 방식·금액을 바꿀 수 없어요. 새 쿠폰을 만들어주세요.',
      );
    await this.prisma.coupon.update({ where: { id }, data: this.couponData(input) });
    await this.audit.log(
      ctx,
      'coupon.update',
      'COUPON',
      id,
      { code: before.code, isActive: before.isActive },
      input,
    );
    return { id };
  }

  async deleteCoupon(ctx: AuditContext, id: string) {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c) throw new AppException('NOT_FOUND');
    if (c.usedCount > 0) {
      await this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
      await this.audit.log(
        ctx,
        'coupon.deactivate',
        'COUPON',
        id,
        { isActive: c.isActive },
        { isActive: false },
      );
      return { deactivated: true };
    }
    await this.prisma.coupon.delete({ where: { id } });
    await this.audit.log(ctx, 'coupon.delete', 'COUPON', id, { code: c.code }, null);
    return { deleted: true };
  }
}
