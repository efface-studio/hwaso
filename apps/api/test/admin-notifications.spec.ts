import type { NotificationType } from '@prisma/client';
import { DEFAULT_ADMIN_NOTIFICATION_PREFS, toAppPath } from '@shop/shared';
import { AdminNotifier } from '../src/notifications/admin-notifier';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser } from './fixtures';

let t: TestContext;
let notifier: AdminNotifier;

beforeAll(async () => {
  t = await createTestApp();
  notifier = t.app.get(AdminNotifier);
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  t.push.sent = [];
  notifier.coalesceMs = 60_000;
  const keys = [...(await t.redis.keys('rl:*')), ...(await t.redis.keys('notify:admin:*'))];
  if (keys.length) await t.redis.del(...keys);
});

type U = Awaited<ReturnType<typeof createUser>>;

const S = '/api/v1/me/notification-settings';
const basePrefs = { push: { auction: true, trade: true, chat: true, activity: true }, quietHours: false };

/** 알림은 응답 이후 비동기로 만들어지므로 잠시 기다린다 */
async function waitFor(userId: string, type: NotificationType, count = 1) {
  for (let i = 0; i < 60; i++) {
    const n = await t.prisma.notification.count({ where: { userId, type } });
    if (n >= count) return n;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`notification ${type} not created for ${userId}`);
}

const countOf = (userId: string, type: NotificationType) =>
  t.prisma.notification.count({ where: { userId, type } });

/** 비동기 발송이 끝날 시간을 준 뒤 "오지 않았음"을 확인할 때 */
const settle = () => new Promise((r) => setTimeout(r, 300));

async function reportProduct(reporter: U) {
  const seller = await createUser(t, 'SELLER');
  const { child } = await createCategory(t);
  const product = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
  await t.http
    .post('/api/v1/reports')
    .set(reporter.auth)
    .send({ targetType: 'PRODUCT', targetId: product.id, reason: 'COUNTERFEIT', detail: '' })
    .expect(201);
  return product;
}

describe('admin notification settings', () => {
  it('admins get the admin group (all on by default) and can change it', async () => {
    const admin = await createUser(t, 'ADMIN');
    const got = await t.http.get(S).set(admin.auth).expect(200);
    expect(got.body.admin).toEqual(DEFAULT_ADMIN_NOTIFICATION_PREFS);

    const admin2 = { enabled: true, types: { ...DEFAULT_ADMIN_NOTIFICATION_PREFS.types, report: false } };
    const put = await t.http
      .put(S)
      .set(admin.auth)
      .send({ ...basePrefs, admin: admin2 })
      .expect(200);
    expect(put.body.admin).toEqual(admin2);
    expect((await t.http.get(S).set(admin.auth).expect(200)).body.admin).toEqual(admin2);

    // admin 을 모르는 이전 앱이 저장해도 관리자 설정은 그대로
    await t.http
      .put(S)
      .set(admin.auth)
      .send({ ...basePrefs, quietHours: true })
      .expect(200);
    const after = await t.http.get(S).set(admin.auth).expect(200);
    expect(after.body).toMatchObject({ quietHours: true, admin: admin2 });
  });

  it('non-admins never see or store admin prefs', async () => {
    for (const role of ['USER', 'SELLER', 'VERIFIED_SELLER'] as const) {
      const u = await createUser(t, role);
      expect((await t.http.get(S).set(u.auth).expect(200)).body).not.toHaveProperty('admin');
      const put = await t.http
        .put(S)
        .set(u.auth)
        .send({ ...basePrefs, admin: { ...DEFAULT_ADMIN_NOTIFICATION_PREFS, enabled: false } })
        .expect(200);
      expect(put.body).not.toHaveProperty('admin');
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row.notificationPrefs).not.toHaveProperty('admin');
    }
  });

  it('rejects malformed admin prefs', async () => {
    const admin = await createUser(t, 'ADMIN');
    await t.http
      .put(S)
      .set(admin.auth)
      .send({ ...basePrefs, admin: { enabled: true, types: { report: true } } })
      .expect(400);
  });
});

describe('admin fan-out', () => {
  it('a new report reaches every active admin who wants it, with a deep link, but no one else', async () => {
    const admin = await createUser(t, 'ADMIN');
    const superAdmin = await createUser(t, 'SUPER_ADMIN');
    const muted = await createUser(t, 'ADMIN');
    const off = await createUser(t, 'ADMIN');
    const suspended = await createUser(t, 'ADMIN');
    const user = await createUser(t);
    const seller = await createUser(t, 'SELLER');
    await t.prisma.user.update({
      where: { id: muted.id },
      data: {
        notificationPrefs: {
          admin: { enabled: true, types: { ...DEFAULT_ADMIN_NOTIFICATION_PREFS.types, report: false } },
        },
      },
    });
    await t.prisma.user.update({
      where: { id: off.id },
      data: { notificationPrefs: { admin: { ...DEFAULT_ADMIN_NOTIFICATION_PREFS, enabled: false } } },
    });
    await t.prisma.user.update({ where: { id: suspended.id }, data: { status: 'SUSPENDED' } });

    const reporter = await createUser(t);
    await reportProduct(reporter);
    await waitFor(admin.id, 'ADMIN_REPORT');
    await waitFor(superAdmin.id, 'ADMIN_REPORT');
    await settle();
    for (const u of [muted, off, suspended, user, seller, reporter])
      expect(await countOf(u.id, 'ADMIN_REPORT')).toBe(0);

    const n = await t.prisma.notification.findFirstOrThrow({
      where: { userId: admin.id, type: 'ADMIN_REPORT' },
    });
    expect(n).toMatchObject({ title: '신고가 접수되었어요', link: '/admin/reports' });
    expect(n.body).toContain('작품 · 가품 의심');
    expect(toAppPath(n.link!)).toBe('/admin/ops/reports');

    const push = t.push.sent.find((p) => p.userId === admin.id);
    expect(push?.msg).toMatchObject({ link: '/admin/reports', threadId: 'admin-report' });
    expect(t.push.sent.map((p) => p.userId)).not.toContain(user.id);
    // 받은 관리자의 알림함 API 로도 보인다
    const inbox = await t.http.get('/api/v1/notifications').set(admin.auth).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ type: 'ADMIN_REPORT', link: '/admin/reports' });
  });

  it('an admin who files a report is not notified about it', async () => {
    const other = await createUser(t, 'ADMIN');
    const reporter = await createUser(t, 'ADMIN');
    await reportProduct(reporter);
    await waitFor(other.id, 'ADMIN_REPORT');
    await settle();
    expect(await countOf(reporter.id, 'ADMIN_REPORT')).toBe(0);
  });

  it('coalesces a burst of reports: one now, then a single "N more" summary', async () => {
    notifier.coalesceMs = 400;
    const admin = await createUser(t, 'ADMIN');
    for (let i = 0; i < 4; i++) await reportProduct(await createUser(t));
    await waitFor(admin.id, 'ADMIN_REPORT', 1);
    await settle();
    expect(await countOf(admin.id, 'ADMIN_REPORT')).toBe(1);

    await waitFor(admin.id, 'ADMIN_REPORT', 2);
    await settle();
    const rows = await t.prisma.notification.findMany({
      where: { userId: admin.id, type: 'ADMIN_REPORT' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.title)).toEqual(['신고가 접수되었어요', '신고 3건이 더 접수되었어요']);
    expect(rows[1]!.link).toBe('/admin/reports');
  });

  it('seller registration asks admins to verify', async () => {
    const admin = await createUser(t, 'ADMIN');
    const u = await createUser(t);
    await t.prisma.user.update({ where: { id: u.id }, data: { identityVerifiedAt: new Date() } });
    await t.http
      .post('/api/v1/me/seller')
      .set(u.auth)
      .send({ bankName: '예시은행', bankAccount: '110-123-456789', accountHolder: '홍길동' })
      .expect(201);
    await waitFor(admin.id, 'ADMIN_SELLER_PENDING');
    const n = await t.prisma.notification.findFirstOrThrow({
      where: { userId: admin.id, type: 'ADMIN_SELLER_PENDING' },
    });
    expect(n.link).toBe('/admin/sellers');
    expect(toAppPath(n.link!)).toBe('/admin/members?tab=sellers');
    expect(JSON.stringify(n)).not.toContain('456789');
  });

  it('a certificate submission asks admins to review', async () => {
    const admin = await createUser(t, 'ADMIN');
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const product = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await t.prisma.certificate.create({
      data: { productId: product.id, issuer: '한국미술감정원', number: 'A-1', verificationStatus: 'PENDING' },
    });
    await notifier.certificateSubmitted(product.id);
    const n = await t.prisma.notification.findFirstOrThrow({
      where: { userId: admin.id, type: 'ADMIN_CERTIFICATE_PENDING' },
    });
    expect(n.body).toContain('한국미술감정원');
    expect(toAppPath(n.link!)).toBe('/admin/catalog?tab=products&verification=PENDING');
  });

  it('OTA: one alert per release (iOS + Android), and the admin who rolls back is skipped', async () => {
    const actor = await createUser(t, 'ADMIN');
    const other = await createUser(t, 'ADMIN');
    const rv = `9.9.${Date.now()}`;
    const u = {
      kind: 'UPDATE',
      runtimeVersion: rv,
      channel: 'production',
      message: '버그 수정',
      critical: false,
    };
    await notifier.appUpdate(u);
    await notifier.appUpdate(u); // 같은 묶음의 다른 플랫폼
    expect(await countOf(other.id, 'ADMIN_APP_UPDATE')).toBe(1);
    const n = await t.prisma.notification.findFirstOrThrow({
      where: { userId: other.id, type: 'ADMIN_APP_UPDATE' },
    });
    expect(n).toMatchObject({ title: '앱 업데이트가 배포되었어요', link: '/admin#updates' });
    expect(toAppPath(n.link!)).toBe('/admin/ops/updates');

    await t.http
      .post('/api/v1/admin/ota/rollback')
      .set(actor.auth)
      .send({ platform: 'ios', runtimeVersion: rv, target: 'embedded' })
      .expect(200);
    await waitFor(other.id, 'ADMIN_APP_UPDATE', 2);
    await settle();
    expect(await countOf(actor.id, 'ADMIN_APP_UPDATE')).toBe(1);
    const latest = await t.prisma.notification.findFirstOrThrow({
      where: { userId: other.id, type: 'ADMIN_APP_UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(latest.title).toBe('앱 업데이트를 되돌렸어요');
  });

  it('a PG-side payment mismatch alerts admins once per payment', async () => {
    const admin = await createUser(t, 'ADMIN');
    const buyer = await createUser(t);
    const seller = await createUser(t, 'SELLER');
    const order = await t.prisma.order.create({
      data: {
        orderNumber: `T${Date.now()}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        source: 'DIRECT',
        itemsAmount: 1000n,
        totalAmount: 1000n,
      },
    });
    const payment = await t.prisma.payment.create({
      data: { orderId: order.id, provider: 'toss', method: 'CARD', amount: 1000n },
    });
    await notifier.paymentIssue(payment.id, 'WEBHOOK_MISMATCH');
    await notifier.paymentIssue(payment.id, 'WEBHOOK_MISMATCH');
    expect(await countOf(admin.id, 'ADMIN_PAYMENT_ISSUE')).toBe(1);
    const n = await t.prisma.notification.findFirstOrThrow({
      where: { userId: admin.id, type: 'ADMIN_PAYMENT_ISSUE' },
    });
    expect(n.body).toContain(order.orderNumber);
    expect(toAppPath(n.link!)).toBe('/admin/commerce?tab=payments');
  });
});
