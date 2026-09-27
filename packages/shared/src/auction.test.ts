import { describe, expect, it } from 'vitest';
import { canTransition, checkBidAmount, extendedEndsAt, minNextBid, suggestIncrement } from './auction';

const base = { startPrice: 100_000, bidIncrement: 10_000, currentPrice: 100_000, bidCount: 0 };

describe('minNextBid', () => {
  it('입찰이 없으면 시작가', () => {
    expect(minNextBid(base)).toBe(100_000);
  });
  it('입찰이 있으면 현재가 + 입찰 단위', () => {
    expect(minNextBid({ ...base, currentPrice: 150_000, bidCount: 3 })).toBe(160_000);
  });
});

describe('checkBidAmount', () => {
  it('최소가 이상 + 단위 정렬이면 통과', () => {
    expect(checkBidAmount(base, 100_000)).toEqual({ ok: true });
    expect(checkBidAmount({ ...base, bidCount: 1 }, 130_000)).toEqual({ ok: true });
  });
  it('최소가 미만은 BID_TOO_LOW + 최소 금액 안내', () => {
    expect(checkBidAmount({ ...base, bidCount: 1 }, 105_000)).toEqual({
      ok: false,
      code: 'BID_TOO_LOW',
      details: { minAmount: 110_000 },
    });
  });
  it('단위가 맞지 않으면 BID_NOT_ALIGNED', () => {
    expect(checkBidAmount({ ...base, bidCount: 1 }, 115_000)).toMatchObject({
      ok: false,
      code: 'BID_NOT_ALIGNED',
    });
  });
  it('과도한 금액은 BID_TOO_HIGH (오타 방지)', () => {
    expect(checkBidAmount(base, 100_000 + 10_000 * 1001)).toMatchObject({ ok: false, code: 'BID_TOO_HIGH' });
  });
  it('즉시 구매가 이상은 BID_EXCEEDS_BUY_NOW', () => {
    expect(checkBidAmount({ ...base, buyNowPrice: 200_000 }, 200_000)).toMatchObject({
      ok: false,
      code: 'BID_EXCEEDS_BUY_NOW',
    });
  });
  it('소수/음수/안전 범위 밖은 거절', () => {
    expect(checkBidAmount(base, 100_000.5).ok).toBe(false);
    expect(checkBidAmount(base, -1).ok).toBe(false);
    expect(checkBidAmount(base, Number.MAX_SAFE_INTEGER + 1).ok).toBe(false);
  });
});

describe('extendedEndsAt', () => {
  const a = {
    endsAt: new Date('2026-10-01T12:00:00Z'),
    maxEndsAt: new Date('2026-10-01T12:30:00Z'),
    autoExtend: true,
    extensionWindowSec: 30,
    extensionSec: 30,
  };
  it('종료 30초 이내 입찰은 30초 연장', () => {
    expect(extendedEndsAt(a, new Date('2026-10-01T11:59:40Z'))?.toISOString()).toBe(
      '2026-10-01T12:00:30.000Z',
    );
  });
  it('연장 창 밖이면 연장 없음', () => {
    expect(extendedEndsAt(a, new Date('2026-10-01T11:59:00Z'))).toBeNull();
  });
  it('autoExtend 가 꺼져 있으면 연장 없음', () => {
    expect(extendedEndsAt({ ...a, autoExtend: false }, new Date('2026-10-01T11:59:50Z'))).toBeNull();
  });
  it('maxEndsAt 을 넘지 않는다', () => {
    const near = { ...a, endsAt: new Date('2026-10-01T12:29:50Z') };
    expect(extendedEndsAt(near, new Date('2026-10-01T12:29:40Z'))?.toISOString()).toBe(
      '2026-10-01T12:30:00.000Z',
    );
  });
  it('이미 maxEndsAt 이면 더 연장하지 않는다', () => {
    expect(extendedEndsAt({ ...a, endsAt: a.maxEndsAt }, new Date('2026-10-01T12:29:50Z'))).toBeNull();
  });
});

describe('상태 전이', () => {
  it('허용된 전이만 가능', () => {
    expect(canTransition('SCHEDULED', 'LIVE')).toBe(true);
    expect(canTransition('LIVE', 'ENDED')).toBe(true);
    expect(canTransition('ENDED', 'LIVE')).toBe(false);
    expect(canTransition('DRAFT', 'LIVE')).toBe(false);
    expect(canTransition('SETTLED', 'CANCELLED')).toBe(false);
  });
});

describe('suggestIncrement', () => {
  it('가격대별 호가 단위', () => {
    expect(suggestIncrement(50_000)).toBe(1_000);
    expect(suggestIncrement(5_000_000)).toBe(50_000);
    expect(suggestIncrement(500_000_000)).toBe(500_000);
  });
});
