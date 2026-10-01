import { afterEach, describe, expect, it } from 'vitest';
import { oauthStateMatches, safeNext, saveOAuthIntent, takeOAuthIntent } from './redirect';

describe('safeNext (open redirect)', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/my/orders')).toBe('/my/orders');
    expect(safeNext('/products/abc?tab=info#reviews')).toBe('/products/abc?tab=info#reviews');
    expect(safeNext('/my/settings?welcome=1&next=%2Fsell')).toBe('/my/settings?welcome=1&next=%2Fsell');
  });

  it('rejects anything that leaves the site', () => {
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r//evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      'evil.com',
      '',
    ])
      expect(safeNext(bad, '/fallback')).toBe('/fallback');
    expect(safeNext(null)).toBe('/');
    expect(safeNext(undefined, '/sell')).toBe('/sell');
  });
});

describe('OAuth intent (login CSRF)', () => {
  afterEach(() => sessionStorage.clear());

  it('accepts only the state this tab started with, once', () => {
    saveOAuthIntent({ mode: 'login', next: '/my', state: 'state-abc' });
    const intent = takeOAuthIntent();
    expect(intent).toEqual({ mode: 'login', next: '/my', state: 'state-abc' });
    expect(oauthStateMatches(intent, 'state-abc')).toBe(true);
    expect(oauthStateMatches(intent, 'attacker-state')).toBe(false);
    // 한 번 읽으면 지워진다
    expect(takeOAuthIntent()).toBeNull();
  });

  it('rejects callbacks without a stored intent', () => {
    expect(oauthStateMatches(takeOAuthIntent(), 'state-abc')).toBe(false);
    expect(oauthStateMatches({ mode: 'login', next: '/', state: null }, 'x')).toBe(false);
  });

  it('sanitises a tampered next value', () => {
    sessionStorage.setItem(
      'shop-oauth-mode',
      JSON.stringify({ mode: 'link', next: '//evil.com', state: 's' }),
    );
    expect(takeOAuthIntent()).toEqual({ mode: 'link', next: '/', state: 's' });
  });
});
