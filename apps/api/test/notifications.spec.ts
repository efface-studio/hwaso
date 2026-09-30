import type { NotificationType } from '@prisma/client';
import { AuctionScheduler } from '../src/auctions/auction-scheduler';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, reauth } from './fixtures';

let t: TestContext;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  t.push.sent = [];
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});

/** 알림은 응답 이후 비동기로 만들어지므로 잠시 기다린다 */
async function waitFor(userId: string, type: NotificationType, count = 1) {
  for (let i = 0; i < 50; i++) {
    const n = await t.prisma.notification.count({ where: { userId, type } });
    if (n >= count) return n;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`notification ${type} not created for ${userId}`);
}

async function liveAuction(endsInMs = 3_600_000) {
  const seller = await createUser(t, 'SELLER');
  const { child } = await createCategory(t);
  const product = await createProduct(t, { sellerId: seller.id, categoryId: child.id, saleType: 'AUCTION' });
  const endsAt = new Date(Date.now() + endsInMs);
  const auction = await t.prisma.auction.create({
    data: {
      productId: product.id,
      sellerId: seller.id,
      status: 'LIVE',
      startPrice: 100_000n,
      bidIncrement: 10_000n,
      currentPrice: 100_000n,
      startsAt: new Date(Date.now() - 60_000),
      endsAt,
      originalEndsAt: endsAt,
      maxEndsAt: new Date(endsAt.getTime() + 1_800_000),
      extensionWindowSec: 30,
      extensionSec: 30,
    },
  });
  return { seller, product, auction };
}

const bid = (auctionId: string, auth: Record<string, string>, amount: number) =>
  t.http
    .post(`/api/v1/auctions/${auctionId}/bids`)
    .set(auth)
    .send({ amount, idempotencyKey: `k-${Math.random().toString(36).slice(2)}-${Date.now()}` });

describe('notification inbox', () => {
  it('lists, counts, marks read and deletes only my notifications', async () => {
    const u = await createUser(t);
    const other = await createUser(t);
    await t.prisma.notification.createMany({
      data: [1, 2, 3].map((i) => ({ userId: u.id, type: 'SYSTEM' as const, title: `공지 ${i}`, body: '' })),
    });
    const list = await t.http.get('/api/v1/notifications').set(u.auth).expect(200);
    expect(list.body.items).toHaveLength(3);
    const count = await t.http.get('/api/v1/notifications/unread-count').set(u.auth).expect(200);
    expect(count.body.unreadCount).toBe(3);

    const first = list.body.items[0].id as string;
    const read = await t.http
      .post('/api/v1/notifications/read')
      .set(u.auth)
      .send({ ids: [first] })
      .expect(200);
    expect(read.body.unreadCount).toBe(2);
    await t.http.delete(`/api/v1/notifications/${first}`).set(other.auth).expect(404);
    await t.http.post('/api/v1/notifications/read').set(u.auth).send({ all: true }).expect(200);
    await t.http.delete('/api/v1/notifications').set(u.auth).expect(200);
    expect(await t.prisma.notification.count({ where: { userId: u.id } })).toBe(0);
  });

  it('saves settings and moves a device token to the current account', async () => {
    const a = await createUser(t);
    const b = await createUser(t);
    const prefs = { push: { auction: false, trade: true, chat: true, activity: true }, quietHours: true };
    await t.http.put('/api/v1/me/notification-settings').set(a.auth).send(prefs).expect(200);
    const got = await t.http.get('/api/v1/me/notification-settings').set(a.auth).expect(200);
    expect(got.body).toEqual(prefs);

    const token = `ExponentPushToken[${Date.now()}]`;
    await t.http.post('/api/v1/me/push-tokens').set(a.auth).send({ token, platform: 'expo' }).expect(200);
    await t.http.post('/api/v1/me/push-tokens').set(b.auth).send({ token, platform: 'expo' }).expect(200);
    const row = await t.prisma.pushToken.findUniqueOrThrow({ where: { token } });
    expect(row.userId).toBe(b.id);
    await t.http.delete('/api/v1/me/push-tokens').set(b.auth).send({ token }).expect(200);
    expect(await t.prisma.pushToken.count({ where: { token } })).toBe(0);
  });
});

describe('auction events', () => {
  it('outbid bidder and seller are notified; push respects category settings', async () => {
    const { seller, auction } = await liveAuction();
    const a = await createUser(t);
    const b = await createUser(t);
    await t.prisma.user.update({
      where: { id: a.id },
      data: { notificationPrefs: { push: { auction: false } } },
    });
    await bid(auction.id, a.auth, 100_000).expect(201);
    await bid(auction.id, b.auth, 110_000).expect(201);
    await waitFor(a.id, 'OUTBID');
    await waitFor(seller.id, 'BID_PLACED', 2);
    const outbid = await t.prisma.notification.findFirstOrThrow({ where: { userId: a.id, type: 'OUTBID' } });
    expect(outbid).toMatchObject({ link: `/auctions/${auction.id}` });
    expect(outbid.body).toContain('110,000원');
    // a 는 경매 푸시를 껐으므로 알림함에만 쌓이고 푸시는 없다
    expect(t.push.sent.some((p) => p.userId === a.id)).toBe(false);
    expect(t.push.sent.some((p) => p.userId === seller.id)).toBe(true);
  });

  it('winner, losers and seller are told how the auction ended', async () => {
    const { seller, auction } = await liveAuction(5_000);
    const a = await createUser(t);
    const b = await createUser(t);
    await bid(auction.id, a.auth, 100_000).expect(201);
    await bid(auction.id, b.auth, 110_000).expect(201);
    await t.prisma.auction.update({
      where: { id: auction.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await t.app.get(AuctionScheduler).tick();
    await waitFor(b.id, 'AUCTION_WON');
    await waitFor(a.id, 'AUCTION_LOST');
    await waitFor(seller.id, 'ITEM_SOLD');
    const won = await t.prisma.notification.findFirstOrThrow({
      where: { userId: b.id, type: 'AUCTION_WON' },
    });
    expect(won.link).toMatch(/^\/orders\//);
  });
});

describe('trade events', () => {
  it('a new inquiry notifies the seller and the answer notifies the asker', async () => {
    const seller = await createUser(t, 'SELLER');
    const buyer = await createUser(t);
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const q = await t.http
      .post(`/api/v1/products/${p.id}/inquiries`)
      .set(buyer.auth)
      .send({ question: '액자 포함인가요?', isPrivate: false })
      .expect(201);
    await waitFor(seller.id, 'INQUIRY_RECEIVED');
    await t.http
      .post(`/api/v1/inquiries/${q.body.id}/answer`)
      .set(seller.auth)
      .send({ answer: '포함입니다.' })
      .expect(201);
    await waitFor(buyer.id, 'INQUIRY_ANSWERED');
  });

  it('a paid order notifies both sides', async () => {
    const seller = await createUser(t, 'SELLER');
    const buyer = await createUser(t);
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
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
      .send({ method: 'CARD' })
      .expect(201);
    await t.http
      .post('/api/v1/payments/confirm')
      .set(buyer.auth)
      .send({ paymentId: prep.body.paymentId, paymentKey: `pk_n_${Date.now()}`, amount: prep.body.amount })
      .expect(200);
    await waitFor(buyer.id, 'PAYMENT_DONE');
    await waitFor(seller.id, 'ITEM_SOLD');
  });

  it('favoriters hear about a price drop', async () => {
    const seller = await createUser(t, 'SELLER');
    const fan = await createUser(t);
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, price: 500_000 });
    await t.prisma.favorite.create({ data: { userId: fan.id, productId: p.id } });
    await t.http.patch(`/api/v1/products/${p.id}`).set(seller.auth).send({ price: 450_000 }).expect(200);
    await waitFor(fan.id, 'PRICE_CHANGED');
  });
});
