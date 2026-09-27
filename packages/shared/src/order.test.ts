import { describe, expect, it } from 'vitest';
import { couponDiscount, settlementAmounts, trackingUrl } from './order';

describe('order helpers', () => {
  it('couponDiscount caps by maxDiscount and items amount', () => {
    expect(couponDiscount({ type: 'FIXED', value: 5_000, maxDiscount: null }, 100_000)).toBe(5_000);
    expect(couponDiscount({ type: 'FIXED', value: 5_000, maxDiscount: null }, 3_000)).toBe(3_000);
    expect(couponDiscount({ type: 'PERCENT', value: 10, maxDiscount: 7_000 }, 100_000)).toBe(7_000);
    expect(couponDiscount({ type: 'PERCENT', value: 10, maxDiscount: null }, 12_345)).toBe(1_234);
  });

  it('settlementAmounts charges fee on items only', () => {
    expect(settlementAmounts(100_000, 5_000)).toEqual({ gross: 105_000, fee: 8_000, net: 97_000 });
  });

  it('trackingUrl only for known carriers with a number', () => {
    expect(trackingUrl('CJ대한통운', '1234 5')).toContain('wblNo=1234%205');
    expect(trackingUrl('직접 전달', '1')).toBeNull();
    expect(trackingUrl('CJ대한통운', null)).toBeNull();
  });
});
