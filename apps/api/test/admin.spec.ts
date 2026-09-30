import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, reauth } from './fixtures';

let t: TestContext;
let seq = 0;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  t.toss.mode = 'DONE';
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});

type U = Awaited<ReturnType<typeof createUser>>;
const A = '/api/v1/admin';

async function sellerWithAccount() {
  const s = await createUser(t, 'SELLER');
  await t.prisma.seller.create({
    data: {
      userId: s.id,
      bankName: '예시',
      bankAccountMasked: '***1',
      bankAccountEnc: 'x',
      accountHolder: 'x',
    },
  });
  return s;
}

/** API 로 결제까지 마친 즉시 구매 주문 */
async function paidOrder() {
  const seller = await sellerWithAccount();
  const buyer = await createUser(t);
  const { child } = await createCategory(t);
  const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, price: 200_000 });
  const addr = await t.http.post('/api/v1/me/addresses').set(buyer.auth).send({
    recipient: '홍길동',
    phone: '01012345678',
    zipCode: '03161',
    address1: '서울 종로구 인사동길 12',
  });
  const order = await t.http
    .post('/api/v1/orders')
    .set(buyer.auth)
    .send({ items: [{ productId: p.id, quantity: 1 }], addressId: addr.body.id })
    .expect(201);
  const prep = await t.http
    .post(`/api/v1/orders/${order.body.id}/payments`)
    .set(buyer.auth)
    .set(await reauth(t, buyer))
    .send({ method: 'CARD' });
  await t.http
    .post('/api/v1/payments/confirm')
    .set(buyer.auth)
    .send({
      paymentId: prep.body.paymentId,
      paymentKey: `pk_adm_${++seq}_${Date.now()}`,
      amount: prep.body.amount,
    })
    .expect(200);
  return { seller, buyer, product: p, orderId: order.body.id as string };
}

const audited = (action: string, targetId: string) =>
  t.prisma.auditLog.count({ where: { action, targetId } });

describe('access', () => {
  it('only admins reach /admin', async () => {
    const user = await createUser(t);
    await t.http.get(`${A}/dashboard`).set(user.auth).expect(403);
    await t.http.get(`${A}/dashboard`).expect(401);
    const admin = await createUser(t, 'ADMIN');
    const d = await t.http.get(`${A}/dashboard`).set(admin.auth).expect(200);
    expect(d.body.series).toHaveLength(14);
    expect(d.body.users.total).toBeGreaterThan(0);
  });
});

describe('members', () => {
  it('suspend logs the user out with a reason, restore brings them back', async () => {
    const admin = await createUser(t, 'ADMIN');
    const user = await createUser(t);
    const found = await t.http.get(`${A}/users`).query({ q: user.email }).set(admin.auth).expect(200);
    expect(found.body.items[0].id).toBe(user.id);

    await t.http
      .post(`${A}/users/${user.id}/suspend`)
      .set(admin.auth)
      .send({ reason: '사기 의심 거래' })
      .expect(200);
    await t.redis.del(`user:status:${user.id}`);
    await t.http.get('/api/v1/auth/me').set(user.auth).expect(401);
    expect(await audited('user.suspend', user.id)).toBe(1);

    const back = await t.http
      .post(`${A}/users/${user.id}/restore`)
      .set(admin.auth)
      .send({ reason: '소명 확인' })
      .expect(200);
    expect(back.body).toMatchObject({ status: 'ACTIVE', statusReason: null });
  });

  it('admins cannot act on themselves or other admins; only super admins grant admin', async () => {
    const admin = await createUser(t, 'ADMIN');
    const other = await createUser(t, 'ADMIN');
    const sa = await createUser(t, 'SUPER_ADMIN');
    const user = await createUser(t);
    await t.http.post(`${A}/users/${admin.id}/suspend`).set(admin.auth).send({ reason: '본인' }).expect(403);
    await t.http.post(`${A}/users/${other.id}/suspend`).set(admin.auth).send({ reason: '동료' }).expect(403);
    await t.http.patch(`${A}/users/${user.id}/role`).set(admin.auth).send({ role: 'ADMIN' }).expect(403);
    const r = await t.http
      .patch(`${A}/users/${user.id}/role`)
      .set(sa.auth)
      .send({ role: 'ADMIN' })
      .expect(200);
    expect(r.body.role).toBe('ADMIN');
    await t.http.patch(`${A}/users/${user.id}/role`).set(sa.auth).send({ role: 'SUPER_ADMIN' }).expect(403);
  });

  it('verifies sellers and resets unpaid strikes', async () => {
    const admin = await createUser(t, 'ADMIN');
    const seller = await sellerWithAccount();
    const pending = await t.http
      .get(`${A}/sellers`)
      .query({ verified: 'pending', q: seller.email })
      .set(admin.auth)
      .expect(200);
    expect(pending.body.total).toBe(1);
    const v = await t.http.post(`${A}/sellers/${seller.id}/verify`).set(admin.auth).expect(200);
    expect(v.body).toMatchObject({ role: 'VERIFIED_SELLER' });
    expect(v.body.sellerVerifiedAt).not.toBeNull();

    await t.prisma.user.update({ where: { id: seller.id }, data: { unpaidStrikes: 3 } });
    const r = await t.http
      .post(`${A}/users/${seller.id}/reset-strikes`)
      .set(admin.auth)
      .send({ reason: '결제 확인' })
      .expect(200);
    expect(r.body.unpaidStrikes).toBe(0);
  });
});

describe('catalog', () => {
  it('hides and restores works, reviews certificates', async () => {
    const admin = await createUser(t, 'ADMIN');
    const seller = await sellerWithAccount();
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await t.prisma.certificate.create({
      data: { productId: p.id, issuer: '한국미술감정원', number: 'K-1', verificationStatus: 'PENDING' },
    });
    await t.http
      .post(`${A}/products/${p.id}/hide`)
      .set(admin.auth)
      .send({ reason: '위작 의심 신고 누적' })
      .expect(200);
    await t.http.get(`/api/v1/products/${p.id}`).expect(404);
    await t.http
      .post(`${A}/products/${p.id}/restore`)
      .set(admin.auth)
      .send({ reason: '감정 확인' })
      .expect(200);
    const c = await t.http
      .post(`${A}/products/${p.id}/certificate`)
      .set(admin.auth)
      .send({ status: 'VERIFIED' })
      .expect(200);
    expect(c.body.status).toBe('VERIFIED');
    const row = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect([row.status, row.verificationStatus]).toEqual(['HIDDEN', 'VERIFIED']);
  });

  it('category CRUD refuses to delete categories in use', async () => {
    const admin = await createUser(t, 'ADMIN');
    const slug = `cat-${++seq}-${Date.now().toString(36)}`;
    const c = await t.http
      .post(`${A}/categories`)
      .set(admin.auth)
      .send({ slug, name: '판화', group: 'ART' })
      .expect(201);
    await t.http
      .post(`${A}/categories`)
      .set(admin.auth)
      .send({ slug, name: '중복', group: 'ART' })
      .expect(409);
    await t.http
      .put(`${A}/categories/${c.body.id}`)
      .set(admin.auth)
      .send({ slug, name: '판화·드로잉', group: 'ART', sortOrder: 3 })
      .expect(200);
    const seller = await createUser(t, 'SELLER');
    await createProduct(t, { sellerId: seller.id, categoryId: c.body.id });
    await t.http.delete(`${A}/categories/${c.body.id}`).set(admin.auth).expect(409);
  });

  it('updates the auction policy', async () => {
    const admin = await createUser(t, 'ADMIN');
    const before = await t.http.get(`${A}/auction-policy`).set(admin.auth).expect(200);
    const next = { ...before.body, extensionSec: 60 };
    delete next.id;
    delete next.updatedAt;
    const r = await t.http.put(`${A}/auction-policy`).set(admin.auth).send(next).expect(200);
    expect(r.body.extensionSec).toBe(60);
    await t.http
      .put(`${A}/auction-policy`)
      .set(admin.auth)
      .send({ ...next, extensionSec: 30 })
      .expect(200);
  });
});

describe('commerce', () => {
  it('dispute refund after completion holds the settlement', async () => {
    const admin = await createUser(t, 'ADMIN');
    const { seller, buyer, orderId } = await paidOrder();
    await t.http
      .post(`/api/v1/orders/${orderId}/ship`)
      .set(seller.auth)
      .send({ carrier: 'CJ대한통운', trackingNumber: '1234' })
      .expect(200);
    await t.http.post(`/api/v1/orders/${orderId}/confirm`).set(buyer.auth).expect(200);
    const r = await t.http
      .post(`${A}/orders/${orderId}/refund`)
      .set(admin.auth)
      .send({ reason: '위작 감정 결과' })
      .expect(200);
    expect(r.body).toMatchObject({ status: 'REFUNDED', payment: { status: 'REFUNDED' } });
    const s = await t.prisma.settlement.findUniqueOrThrow({ where: { orderId } });
    expect(s.status).toBe('HELD');
    expect(await audited('order.refund', orderId)).toBe(1);
  });

  it('pays settlements in bulk and lists payments', async () => {
    const admin = await createUser(t, 'ADMIN');
    const { seller, buyer, orderId } = await paidOrder();
    await t.http
      .post(`/api/v1/orders/${orderId}/ship`)
      .set(seller.auth)
      .send({ carrier: '우체국택배', trackingNumber: '5555' })
      .expect(200);
    await t.http.post(`/api/v1/orders/${orderId}/confirm`).set(buyer.auth).expect(200);
    const s = await t.prisma.settlement.findUniqueOrThrow({ where: { orderId } });
    const r = await t.http
      .post(`${A}/settlements/actions`)
      .set(admin.auth)
      .send({ ids: [s.id], action: 'pay' })
      .expect(200);
    expect(r.body.updated).toBe(1);
    const again = await t.http
      .post(`${A}/settlements/actions`)
      .set(admin.auth)
      .send({ ids: [s.id], action: 'pay' })
      .expect(200);
    expect(again.body.updated).toBe(0);
    const pays = await t.http.get(`${A}/payments`).query({ status: 'DONE' }).set(admin.auth).expect(200);
    expect(pays.body.total).toBeGreaterThan(0);
  });

  it('coupons: create, reject duplicates, deactivate once used', async () => {
    const admin = await createUser(t, 'ADMIN');
    const code = `ADM${++seq}${Date.now().toString(36)}`.toUpperCase();
    const body = {
      code,
      name: '가을 기획전',
      type: 'PERCENT',
      value: 10,
      maxDiscount: 20_000,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const c = await t.http.post(`${A}/coupons`).set(admin.auth).send(body).expect(201);
    await t.http.post(`${A}/coupons`).set(admin.auth).send(body).expect(409);
    await t.http
      .post(`${A}/coupons`)
      .set(admin.auth)
      .send({ ...body, code: `${code}X`, value: 95 })
      .expect(400);
    await t.prisma.coupon.update({ where: { id: c.body.id }, data: { usedCount: 1 } });
    const d = await t.http.delete(`${A}/coupons/${c.body.id}`).set(admin.auth).expect(200);
    expect(d.body).toEqual({ deactivated: true });
  });
});

describe('reports & content', () => {
  it('resolving with an action closes every open report on the target', async () => {
    const admin = await createUser(t, 'ADMIN');
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const reporters: U[] = [await createUser(t), await createUser(t)];
    for (const r of reporters)
      await t.http
        .post('/api/v1/reports')
        .set(r.auth)
        .send({ targetType: 'PRODUCT', targetId: p.id, reason: 'COUNTERFEIT' })
        .expect(201);
    const list = await t.http
      .get(`${A}/reports`)
      .query({ status: 'OPEN', q: p.id })
      .set(admin.auth)
      .expect(200);
    expect(list.body.items[0]).toMatchObject({ targetPreview: p.title, sameTargetCount: 2 });
    await t.http
      .post(`${A}/reports/${list.body.items[0].id}/resolve`)
      .set(admin.auth)
      .send({ status: 'RESOLVED', resolution: '가품 확인', action: 'hide_product' })
      .expect(200);
    expect(await t.prisma.report.count({ where: { targetId: p.id, status: 'RESOLVED' } })).toBe(2);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('SUSPENDED');
  });

  it('notices: public list hides scheduled posts', async () => {
    const admin = await createUser(t, 'ADMIN');
    const now = await t.http
      .post(`${A}/notices`)
      .set(admin.auth)
      .send({ title: `공지 ${++seq}`, body: '내용' })
      .expect(201);
    const later = await t.http
      .post(`${A}/notices`)
      .set(admin.auth)
      .send({
        title: `예약 ${seq}`,
        body: '내용',
        publishedAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const pub = await t.http.get('/api/v1/notices').query({ size: 100 }).expect(200);
    const ids = pub.body.items.map((n: { id: string }) => n.id);
    expect(ids).toContain(now.body.id);
    expect(ids).not.toContain(later.body.id);
    await t.http.get(`/api/v1/notices/${later.body.id}`).expect(404);
    await t.http.delete(`${A}/notices/${now.body.id}`).set(admin.auth).expect(200);
  });

  it('banners validate links and broadcast reaches the audience', async () => {
    const admin = await createUser(t, 'ADMIN');
    const base = {
      title: '가을 경매',
      imageKey: 'img/test/banner',
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    await t.http
      .post(`${A}/banners`)
      .set(admin.auth)
      .send({ ...base, link: 'https://evil.example' })
      .expect(400);
    const b = await t.http
      .post(`${A}/banners`)
      .set(admin.auth)
      .send({ ...base, link: '/auctions' })
      .expect(201);
    expect(b.body.live).toBe(true);
    const home = await t.http.get('/api/v1/home').expect(200);
    expect(home.body.banners.some((x: { id: string }) => x.id === b.body.id)).toBe(true);
    await t.http.delete(`${A}/banners/${b.body.id}`).set(admin.auth).expect(200);

    const target = await sellerWithAccount();
    const r = await t.http
      .post(`${A}/broadcast`)
      .set(admin.auth)
      .send({ title: '정기 점검 안내', body: '새벽 2~4시 점검', audience: 'sellers' })
      .expect(200);
    expect(r.body.recipients).toBeGreaterThan(0);
    for (let i = 0; i < 40 && !(await t.prisma.notification.count({ where: { userId: target.id } })); i++)
      await new Promise((res) => setTimeout(res, 50));
    expect(await t.prisma.notification.count({ where: { userId: target.id, type: 'SYSTEM' } })).toBe(1);
    const logs = await t.http
      .get(`${A}/audit-logs`)
      .query({ targetType: 'BANNER' })
      .set(admin.auth)
      .expect(200);
    expect(logs.body.items.some((l: { targetId: string }) => l.targetId === b.body.id)).toBe(true);
  });
});
