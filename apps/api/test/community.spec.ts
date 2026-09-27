import type { NotificationType } from '@prisma/client';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, fakeUpload } from './fixtures';

let t: TestContext;
let seq = 0;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});

async function waitFor(userId: string, type: NotificationType) {
  for (let i = 0; i < 50; i++) {
    if (await t.prisma.notification.count({ where: { userId, type } })) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`${type} not created`);
}

async function completedOrder(status: 'COMPLETED' | 'PAID' = 'COMPLETED') {
  const seller = await createUser(t, 'SELLER');
  const buyer = await createUser(t);
  const { child } = await createCategory(t);
  const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'SOLD' });
  const order = await t.prisma.order.create({
    data: {
      orderNumber: `R-${++seq}-${Date.now()}`,
      buyerId: buyer.id,
      sellerId: seller.id,
      source: 'DIRECT',
      status,
      itemsAmount: 100_000n,
      totalAmount: 100_000n,
      items: { create: { productId: p.id, titleSnapshot: p.title, unitPrice: 100_000n, quantity: 1 } },
    },
  });
  return { seller, buyer, order };
}

describe('reviews', () => {
  it('both sides review once; ratings aggregate on the profile', async () => {
    const { seller, buyer, order } = await completedOrder();
    const img = await fakeUpload(t, buyer.id);
    await t.http
      .post(`/api/v1/orders/${order.id}/reviews`)
      .set(buyer.auth)
      .send({ rating: 5, comment: '포장이 꼼꼼했어요', imageKeys: [img] })
      .expect(201);
    await t.http
      .post(`/api/v1/orders/${order.id}/reviews`)
      .set(buyer.auth)
      .send({ rating: 4, comment: '두 번째 후기' })
      .expect(409);
    await t.http
      .post(`/api/v1/orders/${order.id}/reviews`)
      .set(seller.auth)
      .send({ rating: 4, comment: '빠른 결제 감사합니다' })
      .expect(201);
    await waitFor(seller.id, 'REVIEW_RECEIVED');

    const profile = await t.http.get(`/api/v1/users/${seller.id}`).expect(200);
    expect(profile.body).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    const list = await t.http.get(`/api/v1/users/${seller.id}/reviews`).set(buyer.auth).expect(200);
    expect(list.body.items[0]).toMatchObject({
      rating: 5,
      direction: 'BUYER_TO_SELLER',
      editable: true,
      images: [{ key: img }],
    });
    const summary = await t.http.get(`/api/v1/users/${seller.id}/reviews/summary`).expect(200);
    expect(summary.body).toEqual({ ratingAvg: 5, ratingCount: 1, distribution: [0, 0, 0, 0, 1] });
  });

  it('only completed trades, only the parties; edit and delete recalc the rating', async () => {
    const pending = await completedOrder('PAID');
    await t.http
      .post(`/api/v1/orders/${pending.order.id}/reviews`)
      .set(pending.buyer.auth)
      .send({ rating: 5, comment: '미리 쓰는 후기' })
      .expect(409);

    const { seller, buyer, order } = await completedOrder();
    const stranger = await createUser(t);
    await t.http
      .post(`/api/v1/orders/${order.id}/reviews`)
      .set(stranger.auth)
      .send({ rating: 1, comment: '남의 거래' })
      .expect(404);
    const r = await t.http
      .post(`/api/v1/orders/${order.id}/reviews`)
      .set(buyer.auth)
      .send({ rating: 2, comment: '조금 아쉬워요' })
      .expect(201);
    await t.http
      .patch(`/api/v1/reviews/${r.body.id}`)
      .set(stranger.auth)
      .send({ rating: 1, comment: '남의 후기 수정' })
      .expect(404);
    await t.http
      .patch(`/api/v1/reviews/${r.body.id}`)
      .set(buyer.auth)
      .send({ rating: 4, comment: '다시 보니 좋아요' })
      .expect(200);
    let p = await t.prisma.profile.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(p.ratingAvg).toBe(4);
    const mine = await t.http.get(`/api/v1/orders/${order.id}/review`).set(buyer.auth).expect(200);
    expect(mine.body).toMatchObject({ rating: 4, comment: '다시 보니 좋아요' });
    await t.http.delete(`/api/v1/reviews/${r.body.id}`).set(buyer.auth).expect(200);
    p = await t.prisma.profile.findUniqueOrThrow({ where: { userId: seller.id } });
    expect([p.ratingAvg, p.ratingCount]).toEqual([0, 0]);
  });
});

describe('follows', () => {
  it('follow → notify, lists with viewer state, unfollow', async () => {
    const seller = await createUser(t, 'SELLER');
    const fan = await createUser(t);
    await t.http.post(`/api/v1/users/${fan.id}/follow`).set(fan.auth).expect(400);
    const r = await t.http.post(`/api/v1/users/${seller.id}/follow`).set(fan.auth).expect(200);
    expect(r.body).toEqual({ following: true, followerCount: 1 });
    await t.http.post(`/api/v1/users/${seller.id}/follow`).set(fan.auth).expect(200);
    await waitFor(seller.id, 'FOLLOWED');
    expect(await t.prisma.notification.count({ where: { userId: seller.id, type: 'FOLLOWED' } })).toBe(1);

    const followers = await t.http.get(`/api/v1/users/${seller.id}/followers`).expect(200);
    expect(followers.body.items[0]).toMatchObject({ id: fan.id, isFollowing: false });
    const following = await t.http.get(`/api/v1/users/${fan.id}/following`).set(fan.auth).expect(200);
    expect(following.body.items[0]).toMatchObject({ id: seller.id, isFollowing: true });
    const profile = await t.http.get(`/api/v1/users/${seller.id}`).set(fan.auth).expect(200);
    expect(profile.body).toMatchObject({ isFollowing: true, followerCount: 1 });

    await t.http.delete(`/api/v1/users/${seller.id}/follow`).set(fan.auth).expect(200);
    expect(await t.prisma.follow.count({ where: { followingId: seller.id } })).toBe(0);
  });

  it('followers hear about new works and see them in the feed', async () => {
    const seller = await createUser(t, 'SELLER');
    const fan = await createUser(t);
    await t.http.post(`/api/v1/users/${seller.id}/follow`).set(fan.auth).expect(200);
    const { child } = await createCategory(t);
    const draft = await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'DRAFT' });
    await t.http.post(`/api/v1/products/${draft.id}/publish`).set(seller.auth).expect(204);
    await waitFor(fan.id, 'FOLLOWING_NEW_ITEM');
    const feed = await t.http.get('/api/v1/me/following/feed').set(fan.auth).expect(200);
    expect(feed.body.items.map((p: { id: string }) => p.id)).toContain(draft.id);
  });
});
