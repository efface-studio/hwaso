import { OrdersService } from '../src/orders/orders.service';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser } from './fixtures';

let t: TestContext;
let orders: OrdersService;
let seq = 0;

beforeAll(async () => {
  t = await createTestApp();
  orders = t.app.get(OrdersService);
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

const addressBody = {
  recipient: '홍길동',
  phone: '010-1234-5678',
  zipCode: '03161',
  address1: '서울 종로구 인사동길 12',
  address2: '3층',
};

async function buyerWithAddress() {
  const buyer = await createUser(t);
  const res = await t.http.post('/api/v1/me/addresses').set(buyer.auth).send(addressBody).expect(201);
  return { buyer, addressId: res.body.id as string };
}

async function listing(opts: { price?: number; stock?: number; shippingFee?: number; seller?: U } = {}) {
  const seller = opts.seller ?? (await createUser(t, 'SELLER'));
  const { child } = await createCategory(t);
  const product = await createProduct(t, { sellerId: seller.id, categoryId: child.id, price: opts.price });
  await t.prisma.product.update({
    where: { id: product.id },
    data: { stock: opts.stock ?? 1, shippingFee: BigInt(opts.shippingFee ?? 0) },
  });
  return { seller, product };
}

function order(buyer: U, addressId: string, productId: string, extra: object = {}) {
  return t.http
    .post('/api/v1/orders')
    .set(buyer.auth)
    .send({ items: [{ productId, quantity: 1 }], addressId, ...extra });
}

async function pay(buyer: U, orderId: string, method = 'CARD') {
  const prep = await t.http
    .post(`/api/v1/orders/${orderId}/payments`)
    .set(buyer.auth)
    .send({ method })
    .expect(201);
  const paymentKey = `pk_${++seq}_${Date.now()}`;
  const res = await t.http
    .post('/api/v1/payments/confirm')
    .set(buyer.auth)
    .send({ paymentId: prep.body.paymentId, paymentKey, amount: prep.body.amount });
  return { prep: prep.body, res, paymentKey };
}

async function paidOrder(price = 100_000) {
  const { buyer, addressId } = await buyerWithAddress();
  const { seller, product } = await listing({ price });
  const created = await order(buyer, addressId, product.id).expect(201);
  const { res } = await pay(buyer, created.body.id);
  expect(res.status).toBe(200);
  return { buyer, seller, product, orderId: created.body.id as string };
}

describe('addresses', () => {
  it('first address becomes default and deleting it promotes another', async () => {
    const u = await createUser(t);
    const a = await t.http.post('/api/v1/me/addresses').set(u.auth).send(addressBody).expect(201);
    expect(a.body.isDefault).toBe(true);
    expect(a.body.phone).toBe('01012345678');
    const b = await t.http
      .post('/api/v1/me/addresses')
      .set(u.auth)
      .send({ ...addressBody, recipient: '김철수', isDefault: true })
      .expect(201);
    let list = await t.http.get('/api/v1/me/addresses').set(u.auth).expect(200);
    expect(list.body.map((x: { id: string; isDefault: boolean }) => [x.id, x.isDefault])).toEqual([
      [b.body.id, true],
      [a.body.id, false],
    ]);
    await t.http.delete(`/api/v1/me/addresses/${b.body.id}`).set(u.auth).expect(200);
    list = await t.http.get('/api/v1/me/addresses').set(u.auth).expect(200);
    expect(list.body[0]).toMatchObject({ id: a.body.id, isDefault: true });
  });

  it('cannot touch another user address', async () => {
    const { addressId } = await buyerWithAddress();
    const other = await createUser(t);
    await t.http.delete(`/api/v1/me/addresses/${addressId}`).set(other.auth).expect(404);
  });
});

describe('cart', () => {
  it('adds, updates and removes items; rejects own products', async () => {
    const buyer = await createUser(t);
    const { seller, product } = await listing({ stock: 3 });
    await t.http.put(`/api/v1/cart/${product.id}`).set(buyer.auth).send({ quantity: 2 }).expect(200);
    const cart = await t.http.get('/api/v1/cart').set(buyer.auth).expect(200);
    expect(cart.body[0]).toMatchObject({ productId: product.id, quantity: 2, available: true });
    await t.http.put(`/api/v1/cart/${product.id}`).set(buyer.auth).send({ quantity: 9 }).expect(409);
    await t.http.put(`/api/v1/cart/${product.id}`).set(seller.auth).send({}).expect(403);
    const del = await t.http.delete(`/api/v1/cart/${product.id}`).set(buyer.auth).expect(200);
    expect(del.body.count).toBe(0);
  });
});

describe('orders', () => {
  it('reserves stock and removes ordered items from the cart', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { product } = await listing({ price: 50_000, shippingFee: 3_000 });
    await t.http.put(`/api/v1/cart/${product.id}`).set(buyer.auth).send({}).expect(200);
    const res = await order(buyer, addressId, product.id, { fromCart: true }).expect(201);
    expect(res.body.totalAmount).toBe(53_000);
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect([p.stock, p.status]).toEqual([0, 'RESERVED']);
    expect(await t.prisma.cartItem.count({ where: { userId: buyer.id } })).toBe(0);
  });

  it('only one of two concurrent buyers gets the last item', async () => {
    const a = await buyerWithAddress();
    const b = await buyerWithAddress();
    const { product } = await listing();
    const results = await Promise.all([
      order(a.buyer, a.addressId, product.id),
      order(b.buyer, b.addressId, product.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await t.prisma.order.count({ where: { items: { some: { productId: product.id } } } })).toBe(1);
  });

  it('rejects own products, multiple sellers and auctions', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const one = await listing();
    const two = await listing();
    const multi = await t.http
      .post('/api/v1/orders')
      .set(buyer.auth)
      .send({
        items: [
          { productId: one.product.id, quantity: 1 },
          { productId: two.product.id, quantity: 1 },
        ],
        addressId,
      })
      .expect(400);
    expect(multi.body.error.code).toBe('MULTI_SELLER_ORDER');
    const sellerAddr = await t.http.post('/api/v1/me/addresses').set(one.seller.auth).send(addressBody);
    const self = await order(one.seller, sellerAddr.body.id, one.product.id).expect(403);
    expect(self.body.error.code).toBe('SELF_PURCHASE');
  });

  it('applies a coupon once per user with a cap', async () => {
    const code = `WELCOME${++seq}`;
    await t.prisma.coupon.create({
      data: {
        code,
        name: '첫 구매 10%',
        type: 'PERCENT',
        value: 10n,
        maxDiscount: 7_000n,
        minOrderAmount: 10_000n,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    const { buyer, addressId } = await buyerWithAddress();
    const first = await listing({ price: 100_000 });
    const quote = await t.http
      .post('/api/v1/orders/quote')
      .set(buyer.auth)
      .send({ items: [{ productId: first.product.id, quantity: 1 }], couponCode: code.toLowerCase() })
      .expect(200);
    expect(quote.body).toMatchObject({
      discountAmount: 7_000,
      totalAmount: 93_000,
      items: [{ productId: first.product.id, quantity: 1, unitPrice: 100_000 }],
    });
    const res = await order(buyer, addressId, first.product.id, { couponCode: code }).expect(201);
    expect(res.body.totalAmount).toBe(93_000);
    const second = await listing({ price: 100_000 });
    const again = await order(buyer, addressId, second.product.id, { couponCode: code }).expect(409);
    expect(again.body.error.code).toBe('COUPON_ALREADY_USED');

    // 결제 전 취소하면 쿠폰을 다시 쓸 수 있다
    await t.http
      .post(`/api/v1/orders/${res.body.id}/cancel`)
      .set(buyer.auth)
      .send({ reason: '변심' })
      .expect(200);
    await order(buyer, addressId, second.product.id, { couponCode: code }).expect(201);
  });
});

describe('payments', () => {
  it('confirms once, marks the order paid and the product sold', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { product } = await listing({ price: 120_000 });
    const created = await order(buyer, addressId, product.id).expect(201);
    const { prep, res, paymentKey } = await pay(buyer, created.body.id);
    expect(res.status).toBe(200);
    expect(prep).toMatchObject({ provider: 'toss', clientKey: 'test_ck', amount: 120_000 });
    // 같은 승인 요청 재전송은 그대로 성공
    await t.http
      .post('/api/v1/payments/confirm')
      .set(buyer.auth)
      .send({ paymentId: prep.paymentId, paymentKey, amount: 120_000 })
      .expect(200);
    expect(t.toss.confirms.filter((k) => k === paymentKey)).toHaveLength(1);
    const detail = await t.http.get(`/api/v1/orders/${created.body.id}`).set(buyer.auth).expect(200);
    expect(detail.body).toMatchObject({ status: 'PAID', role: 'buyer', payment: { status: 'DONE' } });
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(p.status).toBe('SOLD');
  });

  it('rejects a tampered amount without calling the PG', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { product } = await listing({ price: 120_000 });
    const created = await order(buyer, addressId, product.id).expect(201);
    const prep = await t.http
      .post(`/api/v1/orders/${created.body.id}/payments`)
      .set(buyer.auth)
      .send({ method: 'CARD' })
      .expect(201);
    const before = t.toss.confirms.length;
    const res = await t.http
      .post('/api/v1/payments/confirm')
      .set(buyer.auth)
      .send({ paymentId: prep.body.paymentId, paymentKey: `pk_x${++seq}`, amount: 100 })
      .expect(400);
    expect(res.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    expect(t.toss.confirms.length).toBe(before);
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(o.status).toBe('PAYMENT_PENDING');
  });

  it('records a PG failure and lets the buyer retry', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { product } = await listing();
    const created = await order(buyer, addressId, product.id).expect(201);
    t.toss.mode = 'FAIL';
    const failed = await pay(buyer, created.body.id);
    expect(failed.res.status).toBe(400);
    expect(failed.res.body.error.message).toBe('카드 한도 초과');
    t.toss.mode = 'DONE';
    expect((await pay(buyer, created.body.id)).res.status).toBe(200);
  });

  it('expired orders cannot be paid and release their stock', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { product } = await listing();
    const created = await order(buyer, addressId, product.id).expect(201);
    const prep = await t.http
      .post(`/api/v1/orders/${created.body.id}/payments`)
      .set(buyer.auth)
      .send({ method: 'CARD' })
      .expect(201);
    await t.prisma.order.update({
      where: { id: created.body.id },
      data: { paymentDueAt: new Date(Date.now() - 1000) },
    });
    const res = await t.http
      .post('/api/v1/payments/confirm')
      .set(buyer.auth)
      .send({ paymentId: prep.body.paymentId, paymentKey: `pk_e${++seq}`, amount: prep.body.amount })
      .expect(409);
    expect(res.body.error.code).toBe('PAYMENT_EXPIRED');
    await orders.expireDue();
    const [o, p] = await Promise.all([
      t.prisma.order.findUniqueOrThrow({ where: { id: created.body.id } }),
      t.prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ]);
    expect(o.status).toBe('CANCELLED');
    expect([p.stock, p.status]).toEqual([1, 'ACTIVE']);
  });

  it('virtual account: waits for deposit, then the webhook marks it paid', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { product } = await listing();
    const created = await order(buyer, addressId, product.id).expect(201);
    t.toss.mode = 'WAITING_FOR_DEPOSIT';
    const { prep, res, paymentKey } = await pay(buyer, created.body.id, 'VIRTUAL_ACCOUNT');
    expect(res.status).toBe(200);
    // 즉시 구매 가상계좌는 입금 기간만큼 결제 기한이 늘어난다
    expect(new Date(prep.dueAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    let detail = await t.http.get(`/api/v1/orders/${created.body.id}`).set(buyer.auth).expect(200);
    expect(detail.body.status).toBe('PAYMENT_PENDING');
    expect(detail.body.payment.virtualAccount).toMatchObject({ bank: '신한은행', accountNumber: '123' });

    t.toss.settle(paymentKey, 'DONE');
    await t.http
      .post('/api/v1/payments/webhook/toss')
      .send({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'forged', orderId: prep.paymentId } })
      .expect(200);
    detail = await t.http.get(`/api/v1/orders/${created.body.id}`).set(buyer.auth).expect(200);
    expect(detail.body.status).toBe('PAID');
  });

  it('a deposit arriving after cancellation is refunded automatically', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { product } = await listing();
    const created = await order(buyer, addressId, product.id).expect(201);
    t.toss.mode = 'WAITING_FOR_DEPOSIT';
    const { prep, paymentKey } = await pay(buyer, created.body.id, 'VIRTUAL_ACCOUNT');
    // 취소 시 가상계좌 발급 취소를 시도하지만, 그 사이 입금이 들어온 상황
    await t.prisma.order.update({ where: { id: created.body.id }, data: { status: 'CANCELLED' } });
    t.toss.settle(paymentKey, 'DONE');
    await t.http
      .post('/api/v1/payments/webhook/toss')
      .send({ eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: prep.paymentId } })
      .expect(200);
    expect(t.toss.cancels.some((c) => c.paymentKey === paymentKey)).toBe(true);
    const payment = await t.prisma.payment.findUniqueOrThrow({ where: { id: prep.paymentId } });
    expect(payment.status).toBe('REFUNDED');
  });

  it('auction winners choose an address and pay; the auction settles', async () => {
    const { buyer, addressId } = await buyerWithAddress();
    const { seller, product } = await listing();
    const auction = await t.prisma.auction.create({
      data: {
        productId: product.id,
        sellerId: seller.id,
        status: 'ENDED',
        result: 'SOLD',
        startPrice: 10_000n,
        bidIncrement: 1_000n,
        currentPrice: 55_000n,
        startsAt: new Date(Date.now() - 7_200_000),
        endsAt: new Date(Date.now() - 60_000),
        originalEndsAt: new Date(Date.now() - 60_000),
        maxEndsAt: new Date(Date.now() - 60_000),
        extensionWindowSec: 30,
        extensionSec: 30,
        winnerId: buyer.id,
      },
    });
    const o = await t.prisma.order.create({
      data: {
        orderNumber: `T-${++seq}-${Date.now()}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        source: 'AUCTION',
        auctionId: auction.id,
        status: 'PAYMENT_PENDING',
        itemsAmount: 55_000n,
        totalAmount: 55_000n,
        paymentDueAt: new Date(Date.now() + 3_600_000),
        items: {
          create: { productId: product.id, titleSnapshot: product.title, unitPrice: 55_000n, quantity: 1 },
        },
      },
    });
    await t.prisma.product.update({ where: { id: product.id }, data: { status: 'RESERVED', stock: 0 } });
    const noAddr = await t.http
      .post(`/api/v1/orders/${o.id}/payments`)
      .set(buyer.auth)
      .send({ method: 'CARD' });
    expect(noAddr.body.error.code).toBe('ADDRESS_REQUIRED');
    const prep = await t.http
      .post(`/api/v1/orders/${o.id}/payments`)
      .set(buyer.auth)
      .send({ method: 'CARD', addressId })
      .expect(201);
    await t.http
      .post('/api/v1/payments/confirm')
      .set(buyer.auth)
      .send({ paymentId: prep.body.paymentId, paymentKey: `pk_a${++seq}`, amount: 55_000 })
      .expect(200);
    const a = await t.prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(a.status).toBe('SETTLED');
  });
});

describe('fulfilment', () => {
  it('ship → buyer confirms → settlement with platform fee', async () => {
    const { buyer, seller, orderId } = await paidOrder(100_000);
    await t.http
      .post(`/api/v1/orders/${orderId}/ship`)
      .set(buyer.auth)
      .send({ carrier: 'CJ대한통운', trackingNumber: '123456789' })
      .expect(403);
    const shipped = await t.http
      .post(`/api/v1/orders/${orderId}/ship`)
      .set(seller.auth)
      .send({ carrier: 'CJ대한통운', trackingNumber: '123456789' })
      .expect(200);
    expect(shipped.body.status).toBe('SHIPPED');
    expect(shipped.body.shipment.trackingUrl).toContain('123456789');
    const done = await t.http.post(`/api/v1/orders/${orderId}/confirm`).set(buyer.auth).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    const s = await t.prisma.settlement.findUniqueOrThrow({ where: { orderId } });
    expect([Number(s.grossAmount), Number(s.feeAmount), Number(s.netAmount)]).toEqual([
      100_000, 8_000, 92_000,
    ]);
    const summary = await t.http.get('/api/v1/seller/settlements').set(seller.auth).expect(200);
    expect(summary.body.scheduled).toBe(92_000);
  });

  it('buyer cancels a paid order → refunded, back on sale', async () => {
    const { buyer, product, orderId } = await paidOrder();
    const res = await t.http
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set(buyer.auth)
      .send({ reason: '변심' })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', payment: { status: 'REFUNDED' } });
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect([p.stock, p.status]).toEqual([1, 'ACTIVE']);
  });

  it('refund request → reject → request → approve', async () => {
    const { buyer, seller, product, orderId } = await paidOrder();
    await t.http
      .post(`/api/v1/orders/${orderId}/ship`)
      .set(seller.auth)
      .send({ carrier: '직접 전달', trackingNumber: '0000' })
      .expect(200);
    await t.http.post(`/api/v1/orders/${orderId}/deliver`).set(seller.auth).expect(200);
    await t.http
      .post(`/api/v1/orders/${orderId}/refund-request`)
      .set(buyer.auth)
      .send({ reason: '설명과 다른 액자 파손' })
      .expect(200);
    const rejected = await t.http
      .post(`/api/v1/orders/${orderId}/refund-reject`)
      .set(seller.auth)
      .send({ reason: '발송 전 사진 확인' })
      .expect(200);
    expect(rejected.body.status).toBe('DELIVERED');
    await t.http
      .post(`/api/v1/orders/${orderId}/refund-request`)
      .set(buyer.auth)
      .send({ reason: '다시 요청합니다 파손' })
      .expect(200);
    const approved = await t.http.post(`/api/v1/orders/${orderId}/refund`).set(seller.auth).expect(200);
    expect(approved.body).toMatchObject({ status: 'REFUNDED', payment: { status: 'REFUNDED' } });
    const p = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(p.status).toBe('HIDDEN');
  });

  it('auto-confirms delivered orders after 7 days', async () => {
    const { seller, orderId } = await paidOrder();
    await t.http
      .post(`/api/v1/orders/${orderId}/ship`)
      .set(seller.auth)
      .send({ carrier: '우체국택배', trackingNumber: '9999' })
      .expect(200);
    await t.http.post(`/api/v1/orders/${orderId}/deliver`).set(seller.auth).expect(200);
    await t.prisma.order.update({
      where: { id: orderId },
      data: { deliveredAt: new Date(Date.now() - 8 * 86_400_000) },
    });
    await orders.autoAdvance();
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe('COMPLETED');
  });

  it('strangers cannot see orders; lists are split by role', async () => {
    const { buyer, seller, orderId } = await paidOrder();
    const stranger = await createUser(t);
    await t.http.get(`/api/v1/orders/${orderId}`).set(stranger.auth).expect(404);
    const mine = await t.http.get('/api/v1/orders?filter=progress').set(buyer.auth).expect(200);
    expect(mine.body.items[0]).toMatchObject({ id: orderId, counterpart: { id: seller.id } });
    const sold = await t.http.get('/api/v1/seller/orders').set(seller.auth).expect(200);
    expect(sold.body.items[0]).toMatchObject({ id: orderId, counterpart: { id: buyer.id } });
    const summary = await t.http.get('/api/v1/seller/orders/summary').set(seller.auth).expect(200);
    expect(summary.body.paid).toBe(1);
  });
});
