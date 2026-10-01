import { describe, expect, it } from 'vitest';
import {
  ADMIN_LINKS,
  inQuietHours,
  notificationPrefsSchema,
  resolveAdminNotificationPrefs,
  resolveNotificationPrefs,
  toAppPath,
} from './notifications';

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

describe('admin notification prefs', () => {
  it('defaults every admin type to on and keeps saved values', () => {
    expect(resolveAdminNotificationPrefs(undefined)).toEqual({
      enabled: true,
      types: { report: true, seller: true, certificate: true, payment: true, appUpdate: true },
    });
    expect(resolveAdminNotificationPrefs({ enabled: false, types: { report: false } })).toMatchObject({
      enabled: false,
      types: { report: false, seller: true },
    });
  });

  it('admin is optional in the settings body', () => {
    const base = { push: { auction: true, trade: true, chat: true, activity: true }, quietHours: false };
    expect(notificationPrefsSchema.safeParse(base).success).toBe(true);
    expect(notificationPrefsSchema.safeParse({ ...base, admin: { enabled: true } }).success).toBe(false);
  });
});

describe('toAppPath', () => {
  it('maps admin web links to app admin screens and leaves other links alone', () => {
    for (const l of Object.values(ADMIN_LINKS)) expect(toAppPath(l.web)).toBe(l.app);
    expect(toAppPath('/admin/reports')).toBe('/admin/ops/reports');
    expect(toAppPath('/products/p1')).toBe('/products/p1');
    expect(toAppPath('/admin/ops/updates')).toBe('/admin/ops/updates');
  });
});
