import type { ProductCardDto } from '@shop/shared';
import { priceInfo } from './price';

const base: Pick<ProductCardDto, 'saleType' | 'price' | 'status' | 'auction'> = {
  saleType: 'FIXED',
  price: 1_000_000,
  status: 'ACTIVE',
  auction: null,
};
const auction = (status: 'LIVE' | 'SCHEDULED' | 'ENDED', bidCount: number) => ({
  ...base,
  saleType: 'AUCTION' as const,
  price: null,
  auction: { id: 'a', status, bidCount, currentPrice: 500_000, startsAt: '', endsAt: '' },
});

describe('priceInfo', () => {
  it('즉시 구매는 판매가', () => {
    expect(priceInfo(base)).toEqual({ label: '즉시 구매가', amount: 1_000_000 });
  });
  it('경매: 입찰 전 시작가, 입찰 후 현재가 (서버 값 그대로)', () => {
    expect(priceInfo(auction('LIVE', 0))).toEqual({ label: '시작가', amount: 500_000 });
    expect(priceInfo(auction('LIVE', 3))).toEqual({ label: '현재가', amount: 500_000 });
  });
  it('종료된 경매: 낙찰가 또는 유찰', () => {
    expect(priceInfo(auction('ENDED', 2))).toEqual({ label: '낙찰가', amount: 500_000 });
    expect(priceInfo(auction('ENDED', 0))).toEqual({ label: '유찰', amount: null });
  });
});
