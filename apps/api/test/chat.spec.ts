import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, fakeUpload, reauth } from './fixtures';
import { PresenceService } from '../src/realtime/presence';

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

describe('spam (도배 제한)', () => {
  it('10초 안에 8개를 넘게 보내면 CHAT_TOO_FAST', async () => {
    const { buyer, roomId } = await setup();
    for (let i = 0; i < 8; i++) await text(buyer, roomId, `질문 ${i}`).expect(201);
    const res = await text(buyer, roomId, '질문 8').expect(429);
    expect(res.body.error.code).toBe('CHAT_TOO_FAST');
    const msgs = await t.http.get(`/api/v1/chat/rooms/${roomId}/messages`).set(buyer.auth).expect(200);
    expect(msgs.body.items).toHaveLength(8);
  });

  it('같은 글을 30초 안에 세 번째 보내면 CHAT_DUPLICATE (공백·대소문자 무시)', async () => {
    const { buyer, roomId } = await setup();
    await text(buyer, roomId, '가격 조정 되나요?').expect(201);
    await text(buyer, roomId, '  가격 조정   되나요? ').expect(201);
    const res = await text(buyer, roomId, '가격 조정 되나요?').expect(429);
    expect(res.body.error.code).toBe('CHAT_DUPLICATE');
    await text(buyer, roomId, '배송은 어떻게 되나요?').expect(201);
  });

  it('같은 clientId 재전송(네트워크 재시도)은 제한에 세지 않는다', async () => {
    const { buyer, roomId } = await setup();
    for (let i = 0; i < 12; i++) await text(buyer, roomId, '재시도 메시지', 'retry-client-1').expect(201);
    const msgs = await t.http.get(`/api/v1/chat/rooms/${roomId}/messages`).set(buyer.auth).expect(200);
    expect(msgs.body.items).toHaveLength(1);
    await text(buyer, roomId, '다음 메시지').expect(201);
  });
});

describe('trade status & system messages (거래 상태·주문 진행)', () => {
  const trade = (u: U, roomId: string, status: string) =>
    t.http.patch(`/api/v1/chat/rooms/${roomId}/trade`).set(u.auth).send({ status });
  const systemEvents = async (u: U, roomId: string) => {
    const res = await t.http.get(`/api/v1/chat/rooms/${roomId}/messages`).set(u.auth).expect(200);
    return (res.body.items as { kind: string; system: { event: string } | null }[])
      .filter((m) => m.kind === 'SYSTEM')
      .map((m) => m.system?.event);
  };

  it('판매자가 예약 중 → 거래 완료 → 판매 중으로 바꾸고, 방에 시스템 메시지가 남는다', async () => {
    const { seller, buyer, product, roomId } = await setup();
    await trade(buyer, roomId, 'RESERVED').expect(403);
    await trade(seller, roomId, 'RESERVED').expect(200);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe('RESERVED');
    await trade(seller, roomId, 'SOLD').expect(200);
    await trade(seller, roomId, 'ACTIVE').expect(200);
    await trade(seller, roomId, 'HIDDEN').expect(400);
    expect(await systemEvents(buyer, roomId)).toEqual(['TRADE_ACTIVE', 'TRADE_SOLD', 'TRADE_RESERVED']);
    const rooms = await t.http.get('/api/v1/chat/rooms').set(buyer.auth).expect(200);
    expect(rooms.body[0].lastMessage.preview).toContain('판매 중');
  });

  it('결제가 끝나면 대화방에 결제 완료 안내가 남고, 진행 중 주문이 있으면 상태를 바꿀 수 없다', async () => {
    const { seller, buyer, product, roomId } = await setup();
    await t.prisma.product.update({ where: { id: product.id }, data: { stock: 1 } });
    const addr = await t.http
      .post('/api/v1/me/addresses')
      .set(buyer.auth)
      .send({
        recipient: '홍길동',
        phone: '010-1234-5678',
        zipCode: '03161',
        address1: '서울 종로구 인사동길 12',
        address2: '3층',
      })
      .expect(201);
    const created = await t.http
      .post('/api/v1/orders')
      .set(buyer.auth)
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: addr.body.id })
      .expect(201);
    const prep = await t.http
      .post(`/api/v1/orders/${created.body.id}/payments`)
      .set(buyer.auth)
      .set(await reauth(t, buyer))
      .send({ method: 'CARD' })
      .expect(201);
    await t.http
      .post('/api/v1/payments/confirm')
      .set(buyer.auth)
      .send({ paymentId: prep.body.paymentId, paymentKey: `pk_chat_${Date.now()}`, amount: prep.body.amount })
      .expect(200);
    expect(await systemEvents(seller, roomId)).toContain('ORDER_PAID');
    const res = await trade(seller, roomId, 'ACTIVE').expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('multiple images (사진 여러 장)', () => {
  it('한 메시지에 여러 장, 남의 사진이 섞이면 거부, 10장까지', async () => {
    const { seller, buyer, roomId } = await setup();
    const mine = await Promise.all([1, 2, 3].map(() => fakeUpload(t, buyer.id)));
    const res = await say(buyer, roomId, { kind: 'IMAGE', imageKeys: mine }).expect(201);
    expect(res.body.images.map((i: { key: string }) => i.key)).toEqual(mine);
    expect(res.body.image.key).toBe(mine[0]);

    const theirs = await fakeUpload(t, seller.id);
    await say(buyer, roomId, { kind: 'IMAGE', imageKeys: [mine[0], theirs] }).expect(400);
    const eleven = await Promise.all(Array.from({ length: 11 }, () => fakeUpload(t, buyer.id)));
    await say(buyer, roomId, { kind: 'IMAGE', imageKeys: eleven }).expect(400);

    const rooms = await t.http.get('/api/v1/chat/rooms').set(seller.auth).expect(200);
    expect(rooms.body[0].lastMessage.preview).toBe('사진 3장을 보냈어요.');
  });

  it('예전 방식(imageKey 한 장)도 그대로 받는다', async () => {
    const { buyer, roomId } = await setup();
    const key = await fakeUpload(t, buyer.id);
    const res = await say(buyer, roomId, { kind: 'IMAGE', imageKey: key }).expect(201);
    expect(res.body.images).toHaveLength(1);
  });
});

describe('reply (답장)', () => {
  it('같은 방 메시지에 답장하면 인용이 붙고, 원문이 지워지면 인용도 지워진 것으로 보인다', async () => {
    const { seller, buyer, roomId } = await setup();
    const q = await text(buyer, roomId, '액자 포함인가요?').expect(201);
    const a = await say(seller, roomId, {
      kind: 'TEXT',
      body: '네, 포함이에요',
      replyToId: q.body.id,
    }).expect(201);
    expect(a.body.replyTo).toEqual({
      id: q.body.id,
      senderId: buyer.id,
      kind: 'TEXT',
      preview: '액자 포함인가요?',
      deleted: false,
    });

    await t.http.delete(`/api/v1/chat/rooms/${roomId}/messages/${q.body.id}`).set(buyer.auth).expect(200);
    const msgs = await t.http.get(`/api/v1/chat/rooms/${roomId}/messages`).set(seller.auth).expect(200);
    expect(msgs.body.items[0].replyTo).toMatchObject({
      id: q.body.id,
      deleted: true,
      preview: '삭제된 메시지입니다.',
    });
    // 지워진 메시지에는 새로 답장할 수 없다
    await say(seller, roomId, { kind: 'TEXT', body: '다시', replyToId: q.body.id }).expect(404);
  });

  it('다른 방 메시지에는 답장할 수 없다', async () => {
    const a = await setup();
    const b = await setup();
    const other = await text(b.buyer, b.roomId, '다른 방').expect(201);
    await say(a.buyer, a.roomId, { kind: 'TEXT', body: '몰래', replyToId: other.body.id }).expect(404);
  });
});

describe('phrases (자주 쓰는 문구)', () => {
  it('저장한 적 없으면 기본 문구, 저장하면 내 문구 (공백·중복 정리, 20개·100자 제한)', async () => {
    const u = await createUser(t);
    const first = await t.http.get('/api/v1/chat/phrases').set(u.auth).expect(200);
    expect(first.body.phrases.length).toBeGreaterThan(0);

    const saved = await t.http
      .put('/api/v1/chat/phrases')
      .set(u.auth)
      .send({ phrases: [' 아직 판매 중이에요 ', '택배 거래만 가능해요', '아직 판매 중이에요'] })
      .expect(200);
    expect(saved.body.phrases).toEqual(['아직 판매 중이에요', '택배 거래만 가능해요']);
    const again = await t.http.get('/api/v1/chat/phrases').set(u.auth).expect(200);
    expect(again.body.phrases).toEqual(saved.body.phrases);

    // 모두 지우면 빈 목록 그대로 (기본 문구로 돌아가지 않는다)
    await t.http.put('/api/v1/chat/phrases').set(u.auth).send({ phrases: [] }).expect(200);
    expect((await t.http.get('/api/v1/chat/phrases').set(u.auth)).body.phrases).toEqual([]);

    const many = Array.from({ length: 21 }, (_, i) => `문구 ${i}`);
    await t.http.put('/api/v1/chat/phrases').set(u.auth).send({ phrases: many }).expect(400);
    await t.http
      .put('/api/v1/chat/phrases')
      .set(u.auth)
      .send({ phrases: ['가'.repeat(101)] })
      .expect(400);
    await t.http.get('/api/v1/chat/phrases').expect(401);
  });
});

describe('pin (상단 고정)', () => {
  it('고정한 방이 최근 대화보다 먼저 오고, 해제하면 최근순으로 돌아간다', async () => {
    const buyer = await createUser(t);
    const open = async () => {
      const seller = await createUser(t, 'SELLER');
      const { child } = await createCategory(t);
      const product = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
      const room = await t.http.post('/api/v1/chat/rooms').set(buyer.auth).send({ productId: product.id });
      await text(buyer, room.body.id, `안녕하세요 ${++seq}`).expect(201);
      return room.body.id as string;
    };
    const older = await open();
    const newer = await open();
    const order = async () =>
      (await t.http.get('/api/v1/chat/rooms').set(buyer.auth).expect(200)).body.map(
        (r: { id: string; pinned: boolean }) => [r.id, r.pinned],
      );
    expect(await order()).toEqual([
      [newer, false],
      [older, false],
    ]);

    await t.http.patch(`/api/v1/chat/rooms/${older}`).set(buyer.auth).send({ pinned: true }).expect(200);
    expect(await order()).toEqual([
      [older, true],
      [newer, false],
    ]);

    await t.http.patch(`/api/v1/chat/rooms/${older}`).set(buyer.auth).send({ pinned: false }).expect(200);
    expect((await order())[0]).toEqual([newer, false]);
    await t.http.patch(`/api/v1/chat/rooms/${older}`).set(buyer.auth).send({}).expect(400);
  });
});

describe('presence (접속 상태·보고 있는 방)', () => {
  const pushedTo = async (userId: string) => {
    await new Promise((r) => setTimeout(r, 300));
    return t.push.sent.some((p) => p.userId === userId);
  };

  it('대화방을 보고 있으면 푸시를 보내지 않고, 나가면 보낸다', async () => {
    const presence = t.app.get(PresenceService);
    const { seller, buyer, roomId } = await setup();
    await presence.connect(seller.id, 's1');
    await presence.enterRoom(roomId, seller.id, 's1');
    await text(buyer, roomId, '보고 계세요?').expect(201);
    expect(await pushedTo(seller.id)).toBe(false);

    await presence.leaveRoom(roomId, seller.id, 's1');
    await text(buyer, roomId, '이제는요?').expect(201);
    expect(await pushedTo(seller.id)).toBe(true);
  });

  it('상대가 접속 중인지, 마지막 접속 시각을 알려준다', async () => {
    const presence = t.app.get(PresenceService);
    const { seller, buyer, roomId } = await setup();
    const counterpart = async () =>
      (await t.http.get(`/api/v1/chat/rooms/${roomId}`).set(buyer.auth).expect(200)).body.counterpart;
    expect(await counterpart()).toMatchObject({ online: false, lastSeenAt: null });

    await presence.connect(seller.id, 'a');
    await presence.connect(seller.id, 'b');
    expect(await counterpart()).toMatchObject({ online: true });
    await presence.disconnect(seller.id, 'a', []);
    expect(await counterpart()).toMatchObject({ online: true });
    await presence.disconnect(seller.id, 'b', []);
    const after = await counterpart();
    expect(after.online).toBe(false);
    expect(Date.now() - Date.parse(after.lastSeenAt)).toBeLessThan(5_000);

    const list = await t.http.get('/api/v1/chat/rooms').set(buyer.auth).expect(200);
    expect(list.body.find((r: { id: string }) => r.id === roomId).counterpart.online).toBe(false);
  });
});
