import { describe, expect, it } from 'vitest';
import { bannerSchema, broadcastSchema, SITE_PATH } from './admin';

describe('admin links stay on site (open redirect)', () => {
  it('allows site paths only', () => {
    for (const ok of ['/', '/auctions', '/products/abc?tab=info#x', '/my/settings'])
      expect(SITE_PATH.test(ok)).toBe(true);
    for (const bad of ['//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', 'evil', '/a b'])
      expect(SITE_PATH.test(bad)).toBe(false);
  });

  it('applies to banner and broadcast links', () => {
    const banner = {
      title: '배너',
      imageKey: 'img/x',
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-10-31T00:00:00Z',
    };
    expect(bannerSchema.safeParse({ ...banner, link: '/auctions' }).success).toBe(true);
    expect(bannerSchema.safeParse({ ...banner, link: '//evil.com/x' }).success).toBe(false);
    const msg = { title: '공지', body: '내용', audience: 'all' };
    expect(broadcastSchema.safeParse({ ...msg, link: '/notices' }).success).toBe(true);
    expect(broadcastSchema.safeParse({ ...msg, link: '//evil.com' }).success).toBe(false);
  });
});
