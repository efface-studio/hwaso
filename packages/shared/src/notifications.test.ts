import { describe, expect, it } from 'vitest';
import { inQuietHours, resolveNotificationPrefs } from './notifications';

describe('notification prefs', () => {
  it('fills missing values with defaults', () => {
    expect(resolveNotificationPrefs({ push: { chat: false } })).toEqual({
      push: { auction: true, trade: true, chat: false, activity: true },
      quietHours: false,
    });
    expect(resolveNotificationPrefs(null).push.auction).toBe(true);
  });

  it('quiet hours are 21:00–08:00 KST', () => {
    expect(inQuietHours(new Date('2026-09-28T12:00:00Z'))).toBe(true); // 21:00 KST
    expect(inQuietHours(new Date('2026-09-28T22:59:00Z'))).toBe(true); // 07:59 KST
    expect(inQuietHours(new Date('2026-09-28T23:00:00Z'))).toBe(false); // 08:00 KST
    expect(inQuietHours(new Date('2026-09-28T03:00:00Z'))).toBe(false); // 12:00 KST
  });
});
