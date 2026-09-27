import type { AuctionStatus } from './enums';
import type { ErrorCode } from './errors';

/**
 * 경매 규칙. 서버가 최종 판단하며, 클라이언트는 안내 표시용으로만 사용한다 (docs/AUCTION.md).
 */

export const AUCTION_TRANSITIONS: Record<AuctionStatus, readonly AuctionStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['DRAFT', 'LIVE', 'CANCELLED'],
  LIVE: ['ENDED', 'CANCELLED'],
  ENDED: ['SETTLED', 'CANCELLED'],
  SETTLED: [],
  CANCELLED: [],
};

export function canTransition(from: AuctionStatus, to: AuctionStatus): boolean {
  return AUCTION_TRANSITIONS[from].includes(to);
}

export const AUCTION_LIMITS = {
  minStartPrice: 1_000,
  minIncrement: 100,
  /** 오타 방지: 한 번에 올릴 수 있는 최대 호가 단위 수 */
  maxIncrementSteps: 1_000,
} as const;

export interface BidState {
  startPrice: number;
  bidIncrement: number;
  currentPrice: number;
  bidCount: number;
  buyNowPrice?: number | null;
}

export function minNextBid(a: BidState): number {
  return a.bidCount === 0 ? a.startPrice : a.currentPrice + a.bidIncrement;
}

export type BidCheck = { ok: true } | { ok: false; code: ErrorCode; details?: Record<string, number> };

/** 금액 규칙만 검사한다. 상태/시간/사용자 검사는 서버 트랜잭션에서 수행한다. */
export function checkBidAmount(a: BidState, amount: number): BidCheck {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, code: 'VALIDATION_FAILED' };
  const min = minNextBid(a);
  if (amount < min) return { ok: false, code: 'BID_TOO_LOW', details: { minAmount: min } };
  if ((amount - a.startPrice) % a.bidIncrement !== 0) {
    return { ok: false, code: 'BID_NOT_ALIGNED', details: { bidIncrement: a.bidIncrement, minAmount: min } };
  }
  const max = a.currentPrice + a.bidIncrement * AUCTION_LIMITS.maxIncrementSteps;
  if (amount > max) return { ok: false, code: 'BID_TOO_HIGH', details: { maxAmount: max } };
  if (a.buyNowPrice != null && amount >= a.buyNowPrice) {
    return { ok: false, code: 'BID_EXCEEDS_BUY_NOW', details: { buyNowPrice: a.buyNowPrice } };
  }
  return { ok: true };
}

export interface ExtensionState {
  endsAt: Date;
  maxEndsAt: Date;
  autoExtend: boolean;
  extensionWindowSec: number;
  extensionSec: number;
}

/** 종료 직전 입찰 시 연장된 종료 시각. 연장 대상이 아니면 null. */
export function extendedEndsAt(a: ExtensionState, now: Date): Date | null {
  if (!a.autoExtend) return null;
  const remainingMs = a.endsAt.getTime() - now.getTime();
  if (remainingMs <= 0 || remainingMs > a.extensionWindowSec * 1000) return null;
  const next = Math.min(a.endsAt.getTime() + a.extensionSec * 1000, a.maxEndsAt.getTime());
  return next > a.endsAt.getTime() ? new Date(next) : null;
}

/** 판매자 경매 등록 폼의 기본 호가 단위 제안 */
export function suggestIncrement(price: number): number {
  if (price < 100_000) return 1_000;
  if (price < 1_000_000) return 10_000;
  if (price < 10_000_000) return 50_000;
  if (price < 100_000_000) return 100_000;
  return 500_000;
}
