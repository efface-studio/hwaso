import { describe, expect, it } from 'vitest';
import {
  formatDimensions,
  formatPrice,
  formatRelativeTime,
  formatRemaining,
  maskNickname,
  parsePrice,
} from './format';

describe('format', () => {
  it('formatPrice', () => {
    expect(formatPrice(1_050_000)).toBe('1,050,000원');
    expect(formatPrice(0)).toBe('0원');
  });
  it('parsePrice', () => {
    expect(parsePrice('1,050,000원')).toBe(1_050_000);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
  });
  it('formatRemaining', () => {
    expect(formatRemaining((2 * 3600 + 31 * 60 + 12) * 1000)).toBe('02:31:12');
    expect(formatRemaining((3 * 86400 + 4 * 3600 + 10 * 60 + 22) * 1000)).toBe('3일 04:10:22');
    expect(formatRemaining(-5000)).toBe('00:00:00');
    expect(formatRemaining(999)).toBe('00:00:00');
  });
  it('maskNickname', () => {
    expect(maskNickname('collector')).toBe('co******r');
    expect(maskNickname('아트')).toBe('아*');
    expect(maskNickname('abc')).toBe('abc');
  });
  it('formatRelativeTime', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    expect(formatRelativeTime(new Date('2026-09-28T11:59:30Z'), now)).toBe('방금 전');
    expect(formatRelativeTime(new Date('2026-09-28T11:30:00Z'), now)).toBe('30분 전');
    expect(formatRelativeTime(new Date('2026-09-27T11:00:00Z'), now)).toBe('어제');
  });
  it('formatDimensions', () => {
    expect(formatDimensions(53, 45.5, null)).toBe('53.0 × 45.5 cm');
    expect(formatDimensions(null, null, null)).toBeNull();
  });
});
