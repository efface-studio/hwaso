import { describe, expect, it } from 'vitest';
import { palette } from './index';

/** WCAG 2.x 상대 휘도 (#RRGGBB 만) */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** fg 를 alpha 만큼 bg 위에 얹은 색 (배지의 `bg-x/10`) */
const tint = (fg: string, bg: string, alpha: number) =>
  '#' +
  [1, 3, 5]
    .map((i) => {
      const f = parseInt(fg.slice(i, i + 2), 16);
      const b = parseInt(bg.slice(i, i + 2), 16);
      return Math.round(f * alpha + b * (1 - alpha))
        .toString(16)
        .padStart(2, '0');
    })
    .join('');

// 본문 크기로 쓰이는 글자 토큰 — WCAG AA 4.5:1
const TEXT = ['foreground', 'muted', 'faint', 'destructive'] as const;
const GROUNDS = ['background', 'backgroundSoft', 'surface', 'surface2'] as const;

describe.each(['light', 'dark'] as const)('%s 글자 명도 대비', (mode) => {
  const p = palette[mode];
  it.each(TEXT.flatMap((t) => GROUNDS.map((g) => [t, g] as const)))('%s / %s ≥ 4.5', (t, g) => {
    expect(contrast(p[t], p[g])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['background', 'backgroundSoft'] as const)('primary 배지(primarySoft 바탕) / %s ≥ 4.5', (g) => {
    const alpha = parseInt(p.primarySoft.slice(7, 9), 16) / 255;
    expect(contrast(p.primary, tint(p.primarySoft.slice(0, 7), p[g], alpha))).toBeGreaterThanOrEqual(4.5);
  });
  it('경고 배지(destructive 글자 / 10% 바탕) ≥ 4.5', () => {
    expect(contrast(p.destructive, tint(p.destructive, p.background, 0.1))).toBeGreaterThanOrEqual(4.5);
  });
});
