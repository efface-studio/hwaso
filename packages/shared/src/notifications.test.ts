import { describe, expect, it } from 'vitest';
import {
  ADMIN_LINKS,
  inQuietHours,
  isAllowedWebPushEndpoint,
  notificationPrefsSchema,
  pushTokenSchema,
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

describe('push token validation (SSRF)', () => {
  const sub = (endpoint: string) =>
    JSON.stringify({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });

  it('allows only browser push services over https', () => {
    expect(isAllowedWebPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedWebPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isAllowedWebPushEndpoint('https://web.push.apple.com/QW1')).toBe(true);
    expect(isAllowedWebPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedWebPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isAllowedWebPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedWebPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedWebPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isAllowedWebPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isAllowedWebPushEndpoint(123)).toBe(false);
  });

  it('validates web subscriptions and APNs tokens, leaves other platforms alone', () => {
    const ok = (token: string, platform: string) => pushTokenSchema.safeParse({ token, platform }).success;
    expect(ok(sub('https://fcm.googleapis.com/fcm/send/abc'), 'web')).toBe(true);
    expect(ok(sub('https://10.0.0.1/x'), 'web')).toBe(false);
    expect(ok(JSON.stringify({ endpoint: 'https://fcm.googleapis.com/x' }), 'web')).toBe(false);
    expect(ok('not-json-at-all', 'web')).toBe(false);
    expect(ok('a'.repeat(64), 'apns')).toBe(true);
    expect(ok('../../3/device/x?y=1', 'apns')).toBe(false);
    expect(ok('ExponentPushToken[abcdef]', 'expo')).toBe(true);
    expect(ok('fcm-token:APA91b-xyz', 'fcm')).toBe(true);
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
