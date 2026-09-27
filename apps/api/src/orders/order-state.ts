import { Prisma, type Order, type OrderStatus } from '@prisma/client';
import { SETTLEMENT_DELAY_DAYS, canTransitionOrder, settlementAmounts } from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { Tx } from '../prisma/prisma.service';

/**
 * 주문 상태 변경은 모두 이 파일을 거친다: 행 잠금 → 전이표 검사 → 변경 + 이력.
 * 결제·배송·취소·워커가 같은 주문을 동시에 건드려도 한 번에 하나만 적용된다.
 */
export async function lockOrder(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new AppException('NOT_FOUND');
  return tx.order.findUniqueOrThrow({
    where: { id },
    include: { items: true, payments: { orderBy: { createdAt: 'desc' } }, shipment: true },
  });
}
export type LockedOrder = Awaited<ReturnType<typeof lockOrder>>;

export async function setStatus(
  tx: Tx,
  order: Pick<Order, 'id' | 'status'>,
  to: OrderStatus,
  opts: { actorId?: string | null; reason?: string; data?: Prisma.OrderUpdateInput } = {},
) {
  if (!canTransitionOrder(order.status, to)) throw new AppException('INVALID_TRANSITION');
  await tx.orderStatusLog.create({
    data: {
      orderId: order.id,
      from: order.status,
      to,
      actorId: opts.actorId ?? null,
      reason: opts.reason ?? '',
    },
  });
  const updated = await tx.order.update({ where: { id: order.id }, data: { ...opts.data, status: to } });
  order.status = to;
  return updated;
}

/**
 * 취소·환불로 주문이 무효가 될 때 재고·상품 상태·쿠폰을 되돌린다.
 * 즉시 구매: 재고 복구 후 다시 판매 중 / 낙찰: 판매자가 경매를 다시 열 수 있게 비공개 / 반품: 판매자가 확인하도록 판매 중지
 */
export async function releaseOrder(tx: Tx, order: LockedOrder, mode: 'cancel' | 'return') {
  for (const item of order.items) {
    if (order.source === 'AUCTION') {
      await tx.product.update({ where: { id: item.productId }, data: { status: 'DRAFT' } });
      continue;
    }
    const p = await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
    if (p.deletedAt) continue;
    if (mode === 'return') await tx.product.update({ where: { id: p.id }, data: { status: 'HIDDEN' } });
    else if (p.status === 'RESERVED' || p.status === 'SOLD')
      await tx.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } });
  }
  if (order.couponId) {
    await tx.couponRedemption.deleteMany({ where: { orderId: order.id } });
    await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { decrement: 1 } } });
  }
}

/** 결제 완료: 재고가 모두 팔린 상품은 판매 완료, 낙찰 경매는 정산 단계로 */
export async function markPaid(tx: Tx, order: LockedOrder, paidAt: Date) {
  await setStatus(tx, order, 'PAID', { reason: '결제 완료', data: { paidAt } });
  await tx.product.updateMany({
    where: { id: { in: order.items.map((i) => i.productId) }, stock: 0 },
    data: { status: 'SOLD' },
  });
  if (order.auctionId)
    await tx.auction.update({
      where: { id: order.auctionId },
      data: { status: 'SETTLED', version: { increment: 1 } },
    });
}

/** 구매 확정: 거래 수 반영 + 정산 예정 생성 */
export async function markCompleted(tx: Tx, order: LockedOrder, actorId: string | null, reason: string) {
  const now = new Date();
  if (order.status === 'SHIPPED')
    await setStatus(tx, order, 'DELIVERED', {
      actorId,
      reason: '구매자 수령 확인',
      data: { deliveredAt: now },
    });
  await setStatus(tx, order, 'COMPLETED', { actorId, reason, data: { completedAt: now } });
  const { gross, fee, net } = settlementAmounts(Number(order.itemsAmount), Number(order.shippingFee));
  await tx.settlement.create({
    data: {
      sellerId: order.sellerId,
      orderId: order.id,
      grossAmount: BigInt(gross),
      feeAmount: BigInt(fee),
      netAmount: BigInt(net),
      status: 'SCHEDULED',
      scheduledAt: new Date(now.getTime() + SETTLEMENT_DELAY_DAYS * 86_400_000),
    },
  });
  await tx.profile.updateMany({
    where: { userId: { in: [order.buyerId, order.sellerId] } },
    data: { tradeCount: { increment: 1 } },
  });
  if (order.shipment)
    await tx.shipment.update({
      where: { orderId: order.id },
      data: { status: 'DELIVERED', deliveredAt: order.shipment.deliveredAt ?? now },
    });
}

export const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
