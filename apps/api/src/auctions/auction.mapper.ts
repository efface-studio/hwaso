import type { Auction } from '@prisma/client';
import { minNextBid, type AuctionDto } from '@shop/shared';

export function toAuctionDto(a: Auction): AuctionDto {
  const n = (v: bigint) => Number(v);
  return {
    id: a.id,
    productId: a.productId,
    sellerId: a.sellerId,
    status: a.status,
    result: a.result,
    startPrice: n(a.startPrice),
    bidIncrement: n(a.bidIncrement),
    buyNowPrice: a.buyNowPrice == null ? null : n(a.buyNowPrice),
    currentPrice: n(a.currentPrice),
    // 안내용. 입찰 시 서버가 트랜잭션 안에서 다시 계산한다
    minNextBid: minNextBid({
      startPrice: n(a.startPrice),
      bidIncrement: n(a.bidIncrement),
      currentPrice: n(a.currentPrice),
      bidCount: a.bidCount,
    }),
    bidCount: a.bidCount,
    bidderCount: a.bidderCount,
    highestBidderId: a.highestBidderId,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    autoExtend: a.autoExtend,
    extensionWindowSec: a.extensionWindowSec,
    extensionSec: a.extensionSec,
    winnerId: a.winnerId,
    description: a.description,
    seq: a.version,
  };
}

/** 주문번호: 20260928-7K3F9Q (사람이 읽기 쉬운 값, 유니크 제약으로 충돌 방지) */
export function newOrderNumber(now = new Date()): string {
  // 주문번호 날짜는 한국 시간 기준 (고객센터·영수증 날짜와 일치)
  const d = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, '');
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${d}-${s}`;
}
