import { AuctionScheduler } from '../src/auctions/auction-scheduler';
import { createTestApp, type TestContext } from './app';
import { createCategory, createUser } from './fixtures';

let t: TestContext;
let scheduler: AuctionScheduler;
let seq = 0;

beforeAll(async () => {
  t = await createTestApp();
  scheduler = t.app.get(AuctionScheduler);
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});

const key = () => `k-${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

/** 진행 중(LIVE) 경매 픽스처. 시각은 DB now() 기준으로 비교되므로 여유를 둔다 */
async function liveAuction(
  opts: {
    startPrice?: number;
    increment?: number;
    buyNow?: number;
    endsInMs?: number;
    maxExtraSec?: number;
    status?: 'LIVE' | 'SCHEDULED';
    startsInMs?: number;
  } = {},
) {
  const seller = await createUser(t, 'SELLER');
  const { child } = await createCategory(t);
  const start = BigInt(opts.startPrice ?? 100_000);
  const endsAt = new Date(Date.now() + (opts.endsInMs ?? 3_600_000));
  const product = await t.prisma.product.create({
    data: {
      sellerId: seller.id,
      categoryId: child.id,
      title: `경매 작품 ${seq}`,
      saleType: 'AUCTION',
      status: 'ACTIVE',
      publishedAt: new Date(),
      listPrice: start,
      shippingFee: 0n,
    },
  });
  const auction = await t.prisma.auction.create({
    data: {
      productId: product.id,
      sellerId: seller.id,
      status: opts.status ?? 'LIVE',
      startPrice: start,
      bidIncrement: BigInt(opts.increment ?? 10_000),
      buyNowPrice: opts.buyNow ? BigInt(opts.buyNow) : null,
      currentPrice: start,
      startsAt: new Date(Date.now() + (opts.startsInMs ?? -60_000)),
      endsAt,
      originalEndsAt: endsAt,
      maxEndsAt: new Date(endsAt.getTime() + (opts.maxExtraSec ?? 1800) * 1000),
      autoExtend: true,
      extensionWindowSec: 30,
      extensionSec: 30,
    },
  });
  return { seller, product, auction };
}

const bid = (auctionId: string, auth: Record<string, string>, amount: number, idempotencyKey = key()) =>
  t.http.post(`/api/v1/auctions/${auctionId}/bids`).set(auth).send({ amount, idempotencyKey });

describe('입찰 검증 (Bid · Minimum Bid)', () => {
  it('첫 입찰은 시작가부터, 이후는 현재가 + 호가 단위부터', async () => {
    const { auction } = await liveAuction();
    const a = await createUser(t);
    const b = await createUser(t);
    const first = await bid(auction.id, a.auth, 100_000).expect(201);
    expect(first.body).toMatchObject({ currentPrice: 100_000, seq: 1 });
    const low = await bid(auction.id, b.auth, 105_000).expect(400);
    expect(low.body.error).toMatchObject({ code: 'BID_TOO_LOW', details: { minAmount: 110_000 } });
    const misaligned = await bid(auction.id, b.auth, 115_000).expect(400);
    expect(misaligned.body.error.code).toBe('BID_NOT_ALIGNED');
    await bid(auction.id, b.auth, 130_000).expect(201);
  });

  it('판매자 본인 입찰·연속 최고 입찰·즉시구매가 이상 입찰은 거부', async () => {
    const { auction, seller } = await liveAuction({ buyNow: 500_000 });
    const self = await bid(auction.id, seller.auth, 100_000).expect(403);
    expect(self.body.error.code).toBe('SELF_BID');
    const a = await createUser(t);
    await bid(auction.id, a.auth, 100_000).expect(201);
    const again = await bid(auction.id, a.auth, 110_000).expect(409);
    expect(again.body.error.code).toBe('ALREADY_HIGHEST');
    const b = await createUser(t);
    const over = await bid(auction.id, b.auth, 500_000).expect(400);
    expect(over.body.error.code).toBe('BID_EXCEEDS_BUY_NOW');
  });

  it('시작 전·종료 시각이 지난 경매는 입찰할 수 없다 (워커가 아직 종료 처리 전이어도)', async () => {
    const scheduled = await liveAuction({ status: 'SCHEDULED', startsInMs: 3_600_000, endsInMs: 7_200_000 });
    const u = await createUser(t);
    expect((await bid(scheduled.auction.id, u.auth, 100_000).expect(409)).body.error.code).toBe(
      'AUCTION_NOT_LIVE',
    );
    const expired = await liveAuction({ endsInMs: -1000 });
    expect((await bid(expired.auction.id, u.auth, 100_000).expect(409)).body.error.code).toBe(
      'AUCTION_ENDED',
    );
  });

  it('클라이언트가 보낸 가격·상태 필드는 거부한다 (서버 권위)', async () => {
    const { auction } = await liveAuction();
    const u = await createUser(t);
    await t.http
      .post(`/api/v1/auctions/${auction.id}/bids`)
      .set(u.auth)
      .send({ amount: 100_000, idempotencyKey: key(), currentPrice: 1, status: 'ENDED' })
      .expect(400);
  });

  it('1,000만원 이상은 본인인증 필요', async () => {
    const { auction } = await liveAuction({ startPrice: 10_000_000, increment: 100_000 });
    const u = await createUser(t);
    const res = await bid(auction.id, u.auth, 10_000_000).expect(403);
    expect(res.body.error.code).toBe('HIGH_VALUE_IDENTITY_REQUIRED');
  });
});

describe('중복 입찰 (Duplicate Bid · 멱등)', () => {
  it('같은 멱등 키는 순차든 동시든 입찰 1건만 남기고 같은 결과를 돌려준다', async () => {
    const { auction } = await liveAuction();
    const u = await createUser(t);
    const k = key();
    const results = await Promise.all([0, 1, 2, 3].map(() => bid(auction.id, u.auth, 100_000, k)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.bidId)).size).toBe(1);
    const again = await bid(auction.id, u.auth, 100_000, k).expect(201);
    expect(again.body.bidId).toBe(results[0]!.body.bidId);
    expect(await t.prisma.auctionBid.count({ where: { auctionId: auction.id } })).toBe(1);
  });
});

describe('동시 입찰 (Concurrent Bid) — 행 잠금 직렬화', () => {
  it('20명이 같은 금액으로 동시에 입찰하면 정확히 1건만 성공한다', async () => {
    const { auction } = await liveAuction();
    const users = await Promise.all(Array.from({ length: 20 }, () => createUser(t)));
    const results = await Promise.all(users.map((u) => bid(auction.id, u.auth, 100_000)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'BID_TOO_LOW')).toBe(
      true,
    );
    const a = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a).toMatchObject({ bidCount: 1, bidderCount: 1, currentPrice: 100_000n });
  });

  it('서로 다른 금액이 동시에 몰려도 불변식이 유지된다', async () => {
    const { auction } = await liveAuction();
    const users = await Promise.all(Array.from({ length: 25 }, () => createUser(t)));
    // 섞인 순서의 증가 금액
    const amounts = users.map((_, i) => 100_000 + ((i * 7) % 25) * 10_000);
    await Promise.all(users.map((u, i) => bid(auction.id, u.auth, amounts[i]!)));

    const a = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    const bids = await t.prisma.auctionBid.findMany({
      where: { auctionId: auction.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(bids.length).toBeGreaterThan(0);
    // 1) 기록된 입찰은 시간순으로 엄격히 증가
    for (let i = 1; i < bids.length; i++) expect(bids[i]!.amount > bids[i - 1]!.amount).toBe(true);
    // 2) 현재가 = 최고 입찰가, 입찰 수 = 기록 수, 최고 입찰자 = 마지막 입찰자
    expect(a.currentPrice).toBe(bids.at(-1)!.amount);
    expect(a.bidCount).toBe(bids.length);
    expect(a.highestBidderId).toBe(bids.at(-1)!.bidderId);
    expect(a.version).toBe(bids.length);
    // 3) 표시 가격(listPrice)도 현재가와 같다
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: auction.productId } });
    expect(p.listPrice).toBe(a.currentPrice);
  });
});

describe('연장 경매 (Extension)', () => {
  it('종료 30초 이내 입찰은 30초 연장되고 최대 연장 시각을 넘지 않는다', async () => {
    const { auction } = await liveAuction({ endsInMs: 10_000, maxExtraSec: 20 });
    const u = await createUser(t);
    const res = await bid(auction.id, u.auth, 100_000).expect(201);
    expect(res.body.extended).toBe(true);
    const a = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.endsAt.getTime()).toBe(a.maxEndsAt.getTime());
    expect(a.endsAt > auction.endsAt).toBe(true);
  });

  it('연장 창 밖의 입찰은 종료 시각을 바꾸지 않는다', async () => {
    const { auction } = await liveAuction({ endsInMs: 600_000 });
    const u = await createUser(t);
    const res = await bid(auction.id, u.auth, 100_000).expect(201);
    expect(res.body.extended).toBe(false);
    const a = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.endsAt.getTime()).toBe(auction.endsAt.getTime());
  });
});

describe('경매 종료 (Auction End · Winner)', () => {
  it('워커가 종료하면 최고 입찰자가 낙찰자가 되고 결제 대기 주문 1건이 생긴다', async () => {
    const { auction } = await liveAuction({ endsInMs: 5_000 });
    const a = await createUser(t);
    const b = await createUser(t);
    await bid(auction.id, a.auth, 100_000).expect(201);
    await bid(auction.id, b.auth, 120_000).expect(201);
    await t.prisma.auction.update({
      where: { id: auction.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    // 워커 2개가 동시에 돌아도 한 번만 처리된다 (SKIP LOCKED)
    await Promise.all([scheduler.tick(), t.app.get(AuctionScheduler).tick(), scheduler.tick()]);
    const ended = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(ended).toMatchObject({ status: 'ENDED', result: 'SOLD', winnerId: b.id });
    const orders = await t.prisma.order.findMany({ where: { auctionId: auction.id } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      buyerId: b.id,
      status: 'PAYMENT_PENDING',
      totalAmount: 120_000n,
      source: 'AUCTION',
    });
    const product = await t.prisma.product.findUniqueOrThrow({ where: { id: auction.productId } });
    expect(product.status).toBe('RESERVED');

    // 종료 후 입찰 차단
    const c = await createUser(t);
    expect((await bid(auction.id, c.auth, 200_000).expect(409)).body.error.code).toBe('AUCTION_ENDED');
    // 낙찰 내역
    const wins = await t.http.get('/api/v1/me/wins').set(b.auth).expect(200);
    expect(wins.body[0]).toMatchObject({ myMaxBid: 120_000, orderId: orders[0]!.id });
    const lost = await t.http.get('/api/v1/me/wins').set(a.auth).expect(200);
    expect(lost.body).toHaveLength(0);
  });

  it('입찰이 없으면 유찰(NO_BIDS)되고 주문이 생기지 않는다', async () => {
    const { auction } = await liveAuction({ endsInMs: -1000 });
    await scheduler.tick();
    const ended = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(ended).toMatchObject({ status: 'ENDED', result: 'NO_BIDS', winnerId: null });
    expect(await t.prisma.order.count({ where: { auctionId: auction.id } })).toBe(0);
  });

  it('시작 시각이 된 예약 경매는 LIVE 가 된다', async () => {
    const { auction } = await liveAuction({ status: 'SCHEDULED', startsInMs: -1000 });
    await scheduler.tick();
    expect((await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } })).status).toBe('LIVE');
  });

  it('즉시 구매 동시 2건 → 1건만 성공하고 경매가 바로 종료된다', async () => {
    const { auction } = await liveAuction({ buyNow: 300_000 });
    const [a, b] = await Promise.all([createUser(t), createUser(t)]);
    const results = await Promise.all(
      [a, b].map((u) =>
        t.http.post(`/api/v1/auctions/${auction.id}/buy-now`).set(u.auth).send({ idempotencyKey: key() }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const ended = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(ended).toMatchObject({ status: 'ENDED', result: 'SOLD', currentPrice: 300_000n });
    expect(await t.prisma.order.count({ where: { auctionId: auction.id } })).toBe(1);
  });

  it('결제 기한이 지나면 주문 취소·미결제 횟수 증가, 2회면 입찰 제한', async () => {
    const buyer = await createUser(t);
    for (let i = 0; i < 2; i++) {
      const { auction } = await liveAuction({ endsInMs: 5_000 });
      await bid(auction.id, buyer.auth, 100_000).expect(201);
      await t.prisma.auction.update({
        where: { id: auction.id },
        data: { endsAt: new Date(Date.now() - 1000) },
      });
      await scheduler.tick();
      await t.prisma.order.updateMany({
        where: { auctionId: auction.id },
        data: { paymentDueAt: new Date(Date.now() - 1000) },
      });
      await scheduler.tick();
      const a = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
      expect(a.result).toBe('UNPAID');
    }
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).unpaidStrikes).toBe(2);
    const { auction } = await liveAuction();
    expect((await bid(auction.id, buyer.auth, 100_000).expect(403)).body.error.code).toBe(
      'ACCOUNT_RESTRICTED',
    );
  });
});

describe('판매자 경매 관리 (등록 ↔ 예약 ↔ 예약 취소 ↔ 취소)', () => {
  it('초안 → 예약 → 예약 취소 → 취소, 다른 판매자는 접근 불가', async () => {
    const seller = await createUser(t, 'SELLER');
    const other = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await t.prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: child.id,
        title: '경매 예정 작품',
        saleType: 'AUCTION',
        status: 'DRAFT',
      },
    });
    const startsAt = new Date(Date.now() + 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const created = await t.http
      .post('/api/v1/auctions')
      .set(seller.auth)
      .send({ productId: p.id, startPrice: 50_000, bidIncrement: 1_000, startsAt, endsAt })
      .expect(201);
    expect(created.body.status).toBe('DRAFT');
    // 초안은 남에게 보이지 않는다
    await t.http.get(`/api/v1/auctions/${created.body.id}`).set(other.auth).expect(404);
    await t.http.post(`/api/v1/auctions/${created.body.id}/schedule`).set(other.auth).expect(404);

    const scheduled = await t.http
      .post(`/api/v1/auctions/${created.body.id}/schedule`)
      .set(seller.auth)
      .expect(200);
    expect(scheduled.body.status).toBe('SCHEDULED');
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('ACTIVE');
    await t.http.get(`/api/v1/auctions/${created.body.id}`).expect(200);

    await t.http.post(`/api/v1/auctions/${created.body.id}/unschedule`).set(seller.auth).expect(200);
    const cancelled = await t.http
      .post(`/api/v1/auctions/${created.body.id}/cancel`)
      .set(seller.auth)
      .send({ reason: '' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    // 입찰 없이 취소된 경매는 다시 등록할 수 있다
    await t.http
      .post('/api/v1/auctions')
      .set(seller.auth)
      .send({ productId: p.id, startPrice: 40_000, bidIncrement: 1_000, startsAt, endsAt })
      .expect(201);
  });

  it('진행 중 경매는 판매자가 취소할 수 없고, 즉시 구매 상품은 경매 등록 불가', async () => {
    const { auction, seller } = await liveAuction();
    await t.http
      .post(`/api/v1/auctions/${auction.id}/cancel`)
      .set(seller.auth)
      .send({ reason: '' })
      .expect(409);
    const { child } = await createCategory(t);
    const fixed = await t.prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: child.id,
        title: '즉시구매',
        saleType: 'FIXED',
        price: 10_000n,
      },
    });
    await t.http
      .post('/api/v1/auctions')
      .set(seller.auth)
      .send({
        productId: fixed.id,
        startPrice: 1_000,
        bidIncrement: 100,
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 7_200_000).toISOString(),
      })
      .expect(400);
  });

  it('입찰 기록은 닉네임을 마스킹하고 내 입찰을 표시한다', async () => {
    const { auction } = await liveAuction();
    const u = await createUser(t);
    await bid(auction.id, u.auth, 100_000).expect(201);
    const res = await t.http.get(`/api/v1/auctions/${auction.id}/bids`).set(u.auth).expect(200);
    expect(res.body[0]).toMatchObject({ amount: 100_000, isMine: true });
    expect(res.body[0].bidderMasked).toContain('*');
    const snap = await t.http.get(`/api/v1/auctions/${auction.id}`).set(u.auth).expect(200);
    expect(snap.body).toMatchObject({ myLastBid: 100_000, auction: { minNextBid: 110_000, seq: 1 } });
    expect(Date.parse(snap.body.serverTime)).not.toBeNaN();
  });
});

describe('경매 목록 (GET /auctions · 마감 임박순)', () => {
  type Card = { id: string; auction: { endsAt: string } | null };
  /** 커서를 끝까지 따라가며 모은다 (다른 테스트의 경매도 섞여 있다) */
  async function walk(path: string) {
    const items: Card[] = [];
    let cursor: string | null = null;
    let total = 0;
    do {
      const { body } = (await t.http
        .get(`${path}&limit=2${cursor ? `&cursor=${cursor}` : ''}`)
        .expect(200)) as {
        body: { items: Card[]; nextCursor: string | null; total: number };
      };
      items.push(...body.items);
      cursor = body.nextCursor;
      total = body.total;
    } while (cursor);
    return { items, ids: items.map((i) => i.id), total };
  }
  const sortedByEnds = (items: Card[]) =>
    items.every(
      (c, i) => i === 0 || Date.parse(items[i - 1]!.auction!.endsAt) <= Date.parse(c.auction!.endsAt),
    );

  it('진행 중 경매는 종료 임박순으로 빠짐·중복 없이 넘겨 보고, 상품 목록 마감 임박순도 같다', async () => {
    const made = [];
    for (const endsInMs of [3_000_000, 1_000_000, 2_000_000]) made.push(await liveAuction({ endsInMs }));
    const expected = [made[1]!, made[2]!, made[0]!].map((m) => m.product.id);

    for (const path of ['/api/v1/auctions?status=live', '/api/v1/products?sort=ending_soon']) {
      const { items, ids, total } = await walk(path);
      expect(new Set(ids).size).toBe(ids.length);
      expect(total).toBe(ids.length);
      expect(sortedByEnds(items)).toBe(true);
      expect(ids.filter((id) => expected.includes(id))).toEqual(expected);
    }
  });

  it('종료된 경매는 최근 종료순', async () => {
    const made = [];
    for (let i = 0; i < 3; i++) made.push(await liveAuction());
    // 0 이 가장 먼저, 2 가 가장 최근에 끝났다
    for (const [i, m] of made.entries()) {
      await t.prisma.auction.update({
        where: { id: m.auction.id },
        data: { status: 'ENDED', result: 'NO_BIDS', endedAt: new Date(Date.now() - (3 - i) * 60_000) },
      });
    }
    const { ids, total } = await walk('/api/v1/auctions?status=ended');
    expect(total).toBe(ids.length);
    const mine = made.map((m) => m.product.id);
    expect(ids.filter((id) => mine.includes(id))).toEqual([...mine].reverse());
  });
});
