import type { Auction } from '@prisma/client';
import type { Tx } from '../prisma/prisma.service';
import { newOrderNumber } from './auction.mapper';

/**
 * 경매 종료 처리 (잠금을 쥔 트랜잭션 안에서 호출). 워커 종료와 즉시 구매가 같은 로직을 쓴다.
 * 1) ENDED 로 전이 → 이후 입찰은 상태 검증에서 차단  2) 최고 입찰자 확정  3) 낙찰 주문 생성(결제 대기)
 */
export async function finalizeAuction(
  tx: Tx,
  auctionId: string,
  now: Date,
): Promise<{ auction: Auction; orderId: string | null }> {
  const a = await tx.auction.findUniqueOrThrow({ where: { id: auctionId }, include: { product: true } });
  const sold = !!a.highestBidderId;
  let orderId: string | null = null;

  if (sold) {
    const policy = await tx.auctionPolicy.findUnique({ where: { id: 'default' } });
    const shipping = a.product.shippingFee;
    const order = await tx.order.create({
      data: {
        orderNumber: newOrderNumber(now),
        buyerId: a.highestBidderId!,
        sellerId: a.sellerId,
        source: 'AUCTION',
        auctionId: a.id,
        status: 'PAYMENT_PENDING',
        itemsAmount: a.currentPrice,
        shippingFee: shipping,
        totalAmount: a.currentPrice + shipping,
        paymentDueAt: new Date(now.getTime() + (policy?.paymentDueHours ?? 72) * 3_600_000),
        items: {
          create: {
            productId: a.productId,
            titleSnapshot: a.product.title,
            unitPrice: a.currentPrice,
            quantity: 1,
          },
        },
        statusLogs: { create: { from: null, to: 'PAYMENT_PENDING', reason: '경매 낙찰' } },
      },
    });
    orderId = order.id;
  }

  const auction = await tx.auction.update({
    where: { id: auctionId },
    data: {
      status: 'ENDED',
      result: sold ? 'SOLD' : 'NO_BIDS',
      winnerId: a.highestBidderId,
      endedAt: now,
      version: { increment: 1 },
    },
  });
  // 낙찰: 결제 대기 동안 다른 거래가 없도록 예약 상태 / 유찰: 판매자가 다시 등록할 수 있게 비공개
  await tx.product.update({ where: { id: a.productId }, data: { status: sold ? 'RESERVED' : 'DRAFT' } });
  return { auction, orderId };
}
