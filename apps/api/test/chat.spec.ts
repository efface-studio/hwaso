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
  t.push.sent = [];
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});

type U = Awaited<ReturnType<typeof createUser>>;

async function setup() {
  const seller = await createUser(t, 'SELLER');
  const buyer = await createUser(t);
  const { child } = await createCategory(t);
  const product = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
  const room = await t.http
    .post('/api/v1/chat/rooms')
    .set(buyer.auth)
    .send({ productId: product.id })
    .expect(200);
  return { seller, buyer, product, roomId: room.body.id as string };
}

const say = (u: U, roomId: string, body: object) =>
  t.http.post(`/api/v1/chat/rooms/${roomId}/messages`).set(u.auth).send(body);

const text = (u: U, roomId: string, s: string, clientId?: string) =>
  say(u, roomId, { kind: 'TEXT', body: s, ...(clientId ? { clientId } : {}) });

describe('rooms', () => {
  it('opens once per buyer and product; sellers cannot chat on their own work', async () => {
    const { seller, buyer, product, roomId } = await setup();
    const again = await t.http
      .post('/api/v1/chat/rooms')
      .set(buyer.auth)
      .send({ productId: product.id })
      .expect(200);
    expect(again.body.id).toBe(roomId);
    await t.http.post('/api/v1/chat/rooms').set(seller.auth).send({ productId: product.id }).expect(403);
  });

  it('tracks unread counts and read receipts', async () => {
    const { seller, buyer, roomId } = await setup();
    await text(buyer, roomId, '안녕하세요, 액자 포함인가요?').expect(201);
    let rooms = await t.http.get('/api/v1/chat/rooms').set(seller.auth).expect(200);
    expect(rooms.body[0]).toMatchObject({ id: roomId, role: 'seller', unreadCount: 1 });
    expect(rooms.body[0].lastMessage.preview).toContain('액자');
    const total = await t.http.get('/api/v1/chat/unread-count').set(seller.auth).expect(200);
    expect(total.body.unreadCount).toBe(1);

    await t.http.post(`/api/v1/chat/rooms/${roomId}/read`).set(seller.auth).expect(200);
    rooms = await t.http.get('/api/v1/chat/rooms').set(seller.auth).expect(200);
    expect(rooms.body[0].unreadCount).toBe(0);
    const mine = await t.http.get(`/api/v1/chat/rooms/${roomId}`).set(buyer.auth).expect(200);
    expect(mine.body.counterpartLastReadAt).not.toBeNull();
  });

  it('strangers cannot read or post', async () => {
    const { roomId } = await setup();
    const stranger = await createUser(t);
    await t.http.get(`/api/v1/chat/rooms/${roomId}/messages`).set(stranger.auth).expect(404);
    await text(stranger, roomId, '끼어들기').expect(404);
  });

  it('muted rooms are left out of the badge and get no push', async () => {
    const { seller, buyer, roomId } = await setup();
    await t.http.patch(`/api/v1/chat/rooms/${roomId}`).set(seller.auth).send({ muted: true }).expect(200);
    await text(buyer, roomId, '문의드려요').expect(201);
    const total = await t.http.get('/api/v1/chat/unread-count').set(seller.auth).expect(200);
    expect(total.body.unreadCount).toBe(0);
    await new Promise((r) => setTimeout(r, 200));
    expect(t.push.sent.some((p) => p.userId === seller.id)).toBe(false);
  });

  it('pushes to the other side without filling the notification inbox', async () => {
    const { seller, buyer, roomId } = await setup();
    await text(buyer, roomId, '가격 조정 가능할까요?').expect(201);
    for (let i = 0; i < 20 && !t.push.sent.some((p) => p.userId === seller.id); i++)
      await new Promise((r) => setTimeout(r, 50));
    expect(t.push.sent.find((p) => p.userId === seller.id)?.msg.link).toBe(`/chat/${roomId}`);
    expect(await t.prisma.notification.count({ where: { userId: seller.id } })).toBe(0);
  });

  it('leaving hides history until a new message arrives', async () => {
    const { seller, buyer, roomId } = await setup();
    await text(buyer, roomId, '첫 메시지').expect(201);
    await t.http.post(`/api/v1/chat/rooms/${roomId}/leave`).set(buyer.auth).expect(200);
    let rooms = await t.http.get('/api/v1/chat/rooms').set(buyer.auth).expect(200);
    expect(rooms.body.some((r: { id: string }) => r.id === roomId)).toBe(false);

    await text(seller, roomId, '아직 판매 중입니다').expect(201);
    rooms = await t.http.get('/api/v1/chat/rooms').set(buyer.auth).expect(200);
    expect(rooms.body.some((r: { id: string }) => r.id === roomId)).toBe(true);
    const msgs = await t.http.get(`/api/v1/chat/rooms/${roomId}/messages`).set(buyer.auth).expect(200);
    expect(msgs.body.items.map((m: { body: string }) => m.body)).toEqual(['아직 판매 중입니다']);
  });
});

describe('messages', () => {
  it('a retried send with the same clientId stores one message', async () => {
    const { buyer, roomId } = await setup();
    const clientId = `c-${++seq}-${Date.now()}`;
    const [a, b] = await Promise.all([
      text(buyer, roomId, '중복?', clientId),
      text(buyer, roomId, '중복?', clientId),
    ]);
    expect(a.body.id).toBe(b.body.id);
    expect(await t.prisma.chatMessage.count({ where: { roomId } })).toBe(1);
  });

  it('flags external trade, shares works and appointments', async () => {
    const { seller, buyer, product, roomId } = await setup();
    const warn = await text(seller, roomId, '카톡으로 연락 주세요').expect(201);
    expect(warn.body.warning).toBe(true);
    const card = await say(buyer, roomId, { kind: 'PRODUCT', productId: product.id }).expect(201);
    expect(card.body.product).toMatchObject({ id: product.id, title: product.title });
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const appt = await say(seller, roomId, {
      kind: 'APPOINTMENT',
      appointment: { at, place: '인사동 쌈지길 앞' },
    }).expect(201);
    expect(appt.body.appointment).toEqual({ at, place: '인사동 쌈지길 앞' });
    await say(seller, roomId, {
      kind: 'APPOINTMENT',
      appointment: { at: new Date(Date.now() - 60_000).toISOString(), place: '어제' },
    }).expect(400);
  });

  it('images must be uploaded by the sender', async () => {
    const { seller, buyer, roomId } = await setup();
    const theirs = await fakeUpload(t, seller.id);
    await say(buyer, roomId, { kind: 'IMAGE', imageKey: theirs }).expect(400);
    const mine = await fakeUpload(t, buyer.id);
    const res = await say(buyer, roomId, { kind: 'IMAGE', imageKey: mine }).expect(201);
    expect(res.body.image).toMatchObject({ key: mine, width: 800 });
  });

  it('only the sender deletes; the message stays as deleted', async () => {
    const { seller, buyer, roomId } = await setup();
    const m = await text(buyer, roomId, '잘못 보냈어요').expect(201);
    await t.http.delete(`/api/v1/chat/rooms/${roomId}/messages/${m.body.id}`).set(seller.auth).expect(404);
    await t.http.delete(`/api/v1/chat/rooms/${roomId}/messages/${m.body.id}`).set(buyer.auth).expect(200);
    const msgs = await t.http.get(`/api/v1/chat/rooms/${roomId}/messages`).set(seller.auth).expect(200);
    expect(msgs.body.items[0]).toMatchObject({ deleted: true, body: null });
  });
});

describe('safety', () => {
  it('blocking stops messages both ways until unblocked', async () => {
    const { seller, buyer, roomId, product } = await setup();
    await t.http.post(`/api/v1/users/${buyer.id}/block`).set(seller.auth).expect(200);
    await text(buyer, roomId, '안녕하세요').expect(403);
    await text(seller, roomId, '안녕하세요').expect(403);
    await t.http.post('/api/v1/chat/rooms').set(buyer.auth).send({ productId: product.id }).expect(403);
    const room = await t.http.get(`/api/v1/chat/rooms/${roomId}`).set(buyer.auth).expect(200);
    expect(room.body).toMatchObject({ blocked: false, blockedMe: true });
    const list = await t.http.get('/api/v1/me/blocks').set(seller.auth).expect(200);
    expect(list.body[0].id).toBe(buyer.id);
    await t.http.delete(`/api/v1/users/${buyer.id}/block`).set(seller.auth).expect(200);
    await text(buyer, roomId, '다시 안녕하세요').expect(201);
  });

  it('reports once per target and lists my reports', async () => {
    const { seller, buyer, roomId } = await setup();
    const m = await text(seller, roomId, '선입금 해주세요').expect(201);
    const body = { targetType: 'MESSAGE', targetId: m.body.id, reason: 'FRAUD', detail: '외부 입금 유도' };
    await t.http.post('/api/v1/reports').set(buyer.auth).send(body).expect(201);
    await t.http.post('/api/v1/reports').set(buyer.auth).send(body).expect(409);
    await t.http.post('/api/v1/reports').set(seller.auth).send(body).expect(400);
    const mine = await t.http.get('/api/v1/me/reports').set(buyer.auth).expect(200);
    expect(mine.body[0]).toMatchObject({ targetType: 'MESSAGE', status: 'OPEN' });
  });
});
