import { describe, expect, it } from 'vitest';
import { createAuctionSchema } from './schemas/auction';
import { createProductSchema } from './schemas/product';
import { auctionToInput, defaultAuction, draftToInput, emptyDraft, toLocalInput } from './sell';

const img = { key: 'products/a.jpg', width: 800, height: 600, dominantColor: '#ddd' };

describe('sell drafts', () => {
  it('fixed-price draft converts to a valid create input', () => {
    const d = {
      ...emptyDraft(),
      images: [img],
      title: '  백자 달항아리 ',
      categoryId: 'ckcat0000000000000000000',
      price: 1_200_000,
      widthCm: '30',
      heightCm: '',
      productionYear: '1750',
    };
    const input = draftToInput(d, true);
    expect(input.title).toBe('백자 달항아리');
    expect(input.images).toEqual([{ key: 'products/a.jpg' }]);
    expect(input.widthCm).toBe(30);
    expect(input.heightCm).toBeNull();
    expect(input.productionYear).toBe(1750);
    expect(input.certificate).toBeNull();
    expect(createProductSchema.safeParse(input).success).toBe(true);
  });

  it('auction drafts drop the price and keep empty provenance rows out', () => {
    const d = {
      ...emptyDraft(),
      images: [img],
      title: '무제',
      categoryId: 'ckcat0000000000000000000',
      saleType: 'AUCTION' as const,
      price: 50_000,
      provenance: [
        { kind: 'OWNERSHIP' as const, period: '', title: '개인 소장' },
        { kind: 'EXHIBITION' as const, period: '1990', title: '  ' },
      ],
    };
    const input = draftToInput(d, false);
    expect(input.price).toBeNull();
    expect(input.provenance).toEqual([
      { kind: 'OWNERSHIP', period: '연도 미상', title: '개인 소장', description: '' },
    ]);
  });

  it('auction draft suggests a bid increment and yields a valid input', () => {
    const a = { ...defaultAuction(), startPrice: 100_000 };
    const input = auctionToInput(a, 'ckprod000000000000000000');
    expect(input.bidIncrement).toBeGreaterThan(0);
    expect(Date.parse(input.endsAt)).toBeGreaterThan(Date.parse(input.startsAt));
    expect(createAuctionSchema.safeParse(input).success).toBe(true);
  });

  it('toLocalInput formats a date as a local datetime-local value', () => {
    const d = new Date(2026, 8, 28, 9, 5);
    expect(toLocalInput(d)).toBe('2026-09-28T09:05');
  });
});
