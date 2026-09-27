import { describe, expect, it } from 'vitest';
import {
  createAuctionSchema,
  createProductSchema,
  loginSchema,
  placeBidSchema,
  productListQuery,
  signupSchema,
} from './index';

const device = { name: 'Chrome on Windows', platform: 'web' as const };

describe('auth 스키마', () => {
  it('이메일은 소문자·공백 제거', () => {
    const r = loginSchema.parse({ email: '  User@Example.COM ', password: 'x', device });
    expect(r.email).toBe('user@example.com');
  });
  it('허용되지 않은 필드(role)는 거부 — mass assignment 방지', () => {
    const r = signupSchema.safeParse({
      verificationToken: 'x'.repeat(20),
      password: 'abcd1234',
      nickname: '컬렉터',
      agreeTerms: true,
      device,
      role: 'ADMIN',
    });
    expect(r.success).toBe(false);
  });
  it('비밀번호 정책', () => {
    const base = { verificationToken: 'x'.repeat(20), nickname: '컬렉터', agreeTerms: true, device };
    expect(signupSchema.safeParse({ ...base, password: 'short1' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: 'onlyletters' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: 'letters123' }).success).toBe(true);
  });
});

describe('product 스키마', () => {
  const base = { title: '무제', categoryId: 'c1', images: [{ key: 'k' }] };
  it('즉시 구매는 가격 필수', () => {
    expect(createProductSchema.safeParse({ ...base, saleType: 'FIXED' }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, saleType: 'FIXED', price: 10000 }).success).toBe(true);
  });
  it('경매 상품은 가격 없이 생성 가능', () => {
    expect(createProductSchema.safeParse({ ...base, saleType: 'AUCTION' }).success).toBe(true);
  });
  it('소수 금액 거부', () => {
    expect(createProductSchema.safeParse({ ...base, saleType: 'FIXED', price: 100.5 }).success).toBe(false);
  });
  it('목록 쿼리: 콤마 배열과 불리언 변환', () => {
    const q = productListQuery.parse({ saleType: 'FIXED,AUCTION', auctionOnly: 'true', limit: '10' });
    expect(q.saleType).toEqual(['FIXED', 'AUCTION']);
    expect(q.auctionOnly).toBe(true);
    expect(q.limit).toBe(10);
    expect(q.sort).toBe('latest');
  });
});

describe('auction 스키마', () => {
  it('종료가 시작보다 빠르면 거부', () => {
    const r = createAuctionSchema.safeParse({
      productId: 'p',
      startPrice: 10000,
      bidIncrement: 1000,
      startsAt: '2026-10-02T00:00:00Z',
      endsAt: '2026-10-01T00:00:00Z',
    });
    expect(r.success).toBe(false);
  });
  it('입찰 요청은 amount 와 idempotencyKey 만 허용 (클라이언트 가격/상태 불신)', () => {
    expect(placeBidSchema.safeParse({ amount: 10000, idempotencyKey: 'abcdefgh' }).success).toBe(true);
    expect(
      placeBidSchema.safeParse({ amount: 10000, idempotencyKey: 'abcdefgh', currentPrice: 1 }).success,
    ).toBe(false);
  });
});
