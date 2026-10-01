import type { AddressInfo } from 'node:net';
import { LOG_NAMESPACE, type ServerLogEntry } from '@shop/shared';
import { io, type Socket } from 'socket.io-client';
import { AdminLogsGateway } from '../src/admin/admin-logs';
import { AdminUsersService } from '../src/admin/admin-users.service';
import { SuspensionScheduler } from '../src/admin/suspension-scheduler';
import { logBuffer } from '../src/common/log-buffer';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, reauth } from './fixtures';

let t: TestContext;
let seq = 0;
const A = '/api/v1/admin';
const ios = { name: 'iPhone 17', platform: 'ios' as const };
const PW = 'abcd1234';

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  const keys = [...(await t.redis.keys('rl:*')), ...(await t.redis.keys('audit:logs:*'))];
  if (keys.length) await t.redis.del(...keys);
});

type U = Awaited<ReturnType<typeof createUser>>;
const uniq = () => `${Date.now().toString(36)}${++seq}`;
const audits = (action: string, targetId: string) =>
  t.prisma.auditLog.findMany({ where: { action, targetId }, orderBy: { createdAt: 'desc' } });

/** 관리자 API 로 비밀번호 로그인 가능한 회원을 만든다 */
async function created(admin: U, body: Record<string, unknown> = {}) {
  const n = uniq();
  const res = await t.http
    .post(`${A}/users`)
    .set(admin.auth)
    .set(await reauth(t, admin))
    .send({ email: `made_${n}@example.com`, nickname: `made_${n}`.slice(0, 20), password: PW, ...body });
  return res;
}

const login = (email: string, password = PW) =>
  t.http.post('/api/v1/auth/login').send({ email, password, device: ios });

/** 다른 파일에서 남은 최고 관리자를 지워 "마지막 최고 관리자" 상황을 만든다 (테스트 DB 전용) */
const onlyThese = (ids: string[]) =>
  t.prisma.user.updateMany({ where: { role: 'SUPER_ADMIN', id: { notIn: ids } }, data: { role: 'ADMIN' } });

describe('permissions', () => {
  it('non-admins get 403 on every new endpoint', async () => {
    const u = await createUser(t);
    const other = await createUser(t);
    await t.http
      .post(`${A}/users`)
      .set(u.auth)
      .set(await reauth(t, u))
      .send({})
      .expect(403);
    await t.http.patch(`${A}/users/${other.id}`).set(u.auth).send({ bio: 'x' }).expect(403);
    await t.http
      .delete(`${A}/users/${other.id}`)
      .set(u.auth)
      .set(await reauth(t, u))
      .send({ reason: '테스트' })
      .expect(403);
    await t.http.get(`${A}/logs`).set(u.auth).expect(403);
  });

  it('only super admins create admin accounts; nobody but a super admin creates a super admin', async () => {
    const admin = await createUser(t, 'ADMIN');
    const sa = await createUser(t, 'SUPER_ADMIN');
    expect((await created(admin, { role: 'ADMIN' })).status).toBe(403);
    expect((await created(admin, { role: 'SUPER_ADMIN' })).status).toBe(403);
    // 판매자는 정산 계좌 등록이 먼저라 만들 수 없다 (역할 변경과 같은 규칙)
    expect((await created(admin, { role: 'SELLER' })).status).toBe(409);
    expect((await created(admin)).status).toBe(201);
    const a2 = await created(sa, { role: 'ADMIN' });
    expect(a2.status).toBe(201);
    expect(a2.body.user.role).toBe('ADMIN');
    const sa2 = await created(sa, { role: 'SUPER_ADMIN' });
    expect(sa2.status).toBe(201);
    expect(sa2.body.user.role).toBe('SUPER_ADMIN');
  });

  it('admins cannot edit, suspend or delete other admins or themselves', async () => {
    const admin = await createUser(t, 'ADMIN');
    const admin2 = await createUser(t, 'ADMIN');
    const r = await reauth(t, admin);
    await t.http.patch(`${A}/users/${admin2.id}`).set(admin.auth).send({ bio: '바꿈' }).expect(403);
    await t.http
      .delete(`${A}/users/${admin2.id}`)
      .set(admin.auth)
      .set(r)
      .send({ reason: '테스트' })
      .expect(403);
    await t.http
      .post(`${A}/users/${admin2.id}/suspend`)
      .set(admin.auth)
      .send({ reason: '테스트' })
      .expect(403);
    await t.http.patch(`${A}/users/${admin.id}`).set(admin.auth).send({ bio: '나' }).expect(403);
    await t.http
      .delete(`${A}/users/${admin.id}`)
      .set(admin.auth)
      .set(r)
      .send({ reason: '테스트' })
      .expect(403);
    await t.http.patch(`${A}/users/${admin2.id}/role`).set(admin.auth).send({ role: 'USER' }).expect(403);
  });

  it('super admins grant and revoke super admin; self-change is blocked; ADMIN cannot grant ADMIN', async () => {
    const admin = await createUser(t, 'ADMIN');
    const sa = await createUser(t, 'SUPER_ADMIN');
    const u = await createUser(t);
    await t.http.patch(`${A}/users/${u.id}/role`).set(admin.auth).send({ role: 'ADMIN' }).expect(403);
    await t.http.patch(`${A}/users/${sa.id}/role`).set(sa.auth).send({ role: 'ADMIN' }).expect(403);

    const granted = await t.http
      .patch(`${A}/users/${u.id}/role`)
      .set(sa.auth)
      .send({ role: 'SUPER_ADMIN' })
      .expect(200);
    expect(granted.body.role).toBe('SUPER_ADMIN');
    // 새 최고 관리자가 기존 최고 관리자를 강등 → 세션이 끊겨 기존 토큰은 바로 거부된다
    const demoted = await t.http
      .patch(`${A}/users/${sa.id}/role`)
      .set(u.auth)
      .send({ role: 'ADMIN' })
      .expect(200);
    expect(demoted.body.role).toBe('ADMIN');
    await t.http.get(`${A}/dashboard`).set(sa.auth).expect(401);
    const [log] = await audits('user.role', sa.id);
    expect(log).toMatchObject({
      before: { role: 'SUPER_ADMIN' },
      after: { role: 'ADMIN', sessionsRevoked: true },
    });
  });

  it('the last active super admin can never be demoted, suspended or deleted (checked under a row lock)', async () => {
    const a = await createUser(t, 'SUPER_ADMIN');
    const b = await createUser(t, 'SUPER_ADMIN');
    await onlyThese([a.id, b.id]);
    // 동시에 서로를 강등해도 한 명은 남는다
    const [x, y] = await Promise.all([
      t.http.patch(`${A}/users/${b.id}/role`).set(a.auth).send({ role: 'USER' }),
      t.http.patch(`${A}/users/${a.id}/role`).set(b.auth).send({ role: 'USER' }),
    ]);
    expect([x.status, y.status].filter((s) => s === 200)).toHaveLength(1);
    const left = await t.prisma.user.count({ where: { role: 'SUPER_ADMIN', id: { in: [a.id, b.id] } } });
    expect(left).toBe(1);

    // 역할 캐시가 늦은 처리자가 마지막 최고 관리자를 건드리는 경우 (서비스 직접 호출로 재현)
    const survivor = x.status === 200 ? a : b;
    const stale = x.status === 200 ? b : a;
    const svc = t.app.get(AdminUsersService);
    const ctx = {
      user: { id: stale.id, role: 'SUPER_ADMIN' as const, sessionId: stale.sessionId },
      ip: null,
    };
    await expect(svc.setRole(ctx, survivor.id, 'USER')).rejects.toMatchObject({ status: 409 });
    await expect(svc.suspend(ctx, survivor.id, '테스트', null)).rejects.toMatchObject({ status: 409 });
    await expect(svc.remove(ctx, survivor.id, '테스트')).rejects.toMatchObject({ status: 409 });
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: survivor.id } })).role).toBe('SUPER_ADMIN');
  });
});

describe('create', () => {
  it('creates a verified account without mail, forces consent on first login, and audits without secrets', async () => {
    const admin = await createUser(t, 'ADMIN');
    const mails = t.mail.sent.length;
    const n = uniq();
    const res = await t.http
      .post(`${A}/users`)
      .set(admin.auth)
      .set(await reauth(t, admin))
      .send({
        email: `NEW_${n}@Example.com`,
        nickname: `new_${n}`.slice(0, 20),
        reason: '오프라인 가입 대행',
      })
      .expect(201);
    const { user, temporaryPassword } = res.body as {
      user: { id: string; email: string };
      temporaryPassword: string;
    };
    expect(user.email).toBe(`new_${n}@example.com`);
    expect(res.body.user).toMatchObject({ role: 'USER', consentRequired: true, hasPassword: true });
    expect(res.body.user.emailVerifiedAt).toBeTruthy();
    expect(temporaryPassword).toMatch(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{14}$/);
    expect(t.mail.sent.length).toBe(mails);

    const li = await login(user.email, temporaryPassword).expect(200);
    expect(li.body.user.consentRequired).toBe(true);
    // 동의 전에는 쓰기 요청이 막힌다
    const w = await t.http
      .patch('/api/v1/users/me/profile')
      .set({ Authorization: `Bearer ${li.body.accessToken}` })
      .send({ bio: 'hi' });
    expect(w.body.error.code).toBe('CONSENT_REQUIRED');

    const [log] = await audits('user.create', user.id);
    expect(log!.actorId).toBe(admin.id);
    expect(log!.after).toMatchObject({ role: 'USER', emailVerified: true, passwordGenerated: true });
    expect(JSON.stringify(log)).not.toContain(temporaryPassword);
  });

  it('rejects duplicate emails/nicknames, internal addresses, and requires re-auth on app sessions', async () => {
    const admin = await createUser(t, 'ADMIN');
    const existing = await createUser(t);
    expect((await created(admin, { email: existing.email })).body.error.code).toBe('ACCOUNT_EXISTS');
    const profile = await t.prisma.profile.findUniqueOrThrow({ where: { userId: existing.id } });
    expect((await created(admin, { nickname: profile.nickname })).body.error.code).toBe('NICKNAME_TAKEN');
    expect((await created(admin, { email: `x${uniq()}@social.invalid` })).status).toBe(400);
    expect((await created(admin, { password: 'short' })).status).toBe(400);
    const noReauth = await t.http
      .post(`${A}/users`)
      .set(admin.auth)
      .send({ email: `r${uniq()}@example.com`, nickname: `r_${uniq()}` });
    expect(noReauth.body.error.code).toBe('REAUTH_REQUIRED');
  });
});

describe('edit', () => {
  it('updates profile and email with uniqueness checks and before/after audit', async () => {
    const admin = await createUser(t, 'ADMIN');
    const u = await createUser(t);
    const other = await createUser(t);
    const otherProfile = await t.prisma.profile.findUniqueOrThrow({ where: { userId: other.id } });
    const taken = await t.http.patch(`${A}/users/${u.id}`).set(admin.auth).send({ email: other.email });
    expect(taken.body.error.code).toBe('ACCOUNT_EXISTS');
    const nick = await t.http
      .patch(`${A}/users/${u.id}`)
      .set(admin.auth)
      .send({ nickname: otherProfile.nickname });
    expect(nick.body.error.code).toBe('NICKNAME_TAKEN');
    await t.http.patch(`${A}/users/${u.id}`).set(admin.auth).send({}).expect(400);
    await t.http.patch(`${A}/users/${u.id}`).set(admin.auth).send({ role: 'ADMIN' }).expect(400);
    const seller = await t.http.patch(`${A}/users/${u.id}`).set(admin.auth).send({ businessName: '상호' });
    expect(seller.status).toBe(409);

    const n = uniq();
    const res = await t.http
      .patch(`${A}/users/${u.id}`)
      .set(admin.auth)
      .send({
        email: `moved_${n}@example.com`,
        nickname: `mv_${n}`.slice(0, 20),
        bio: '소개',
        reason: '요청',
      })
      .expect(200);
    // 새 주소는 관리자가 인증 완료로 고르지 않으면 인증 전
    expect(res.body).toMatchObject({ email: `moved_${n}@example.com`, emailVerifiedAt: null });
    expect(res.body.profile.bio).toBe('소개');
    const [log] = await audits('user.update', u.id);
    expect(log!.before).toMatchObject({ email: u.email, emailVerified: true, bio: '' });
    expect(log!.after).toMatchObject({
      email: `moved_${n}@example.com`,
      emailVerified: false,
      reason: '요청',
    });

    const verified = await t.http
      .patch(`${A}/users/${u.id}`)
      .set(admin.auth)
      .send({ emailVerified: true })
      .expect(200);
    expect(verified.body.emailVerifiedAt).toBeTruthy();
  });
});

describe('delete', () => {
  it('anonymizes like self-deletion, revokes sessions and audits with a masked email', async () => {
    const admin = await createUser(t, 'ADMIN');
    const u = await createUser(t);
    await t.http.delete(`${A}/users/${u.id}`).set(admin.auth).send({ reason: '요청' }).expect(403); // 재인증 없음
    await t.http
      .delete(`${A}/users/${u.id}`)
      .set(admin.auth)
      .set(await reauth(t, admin))
      .send({ reason: '본인 요청으로 삭제' })
      .expect(200, { id: u.id, deleted: true });
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { profile: true } });
    expect(row).toMatchObject({ status: 'DELETED', email: `deleted+${u.id}@invalid`, passwordHash: null });
    expect(row.profile!.nickname).toBe(`탈퇴회원_${u.id.slice(-8)}`);
    await t.http.get('/api/v1/notifications/unread-count').set(u.auth).expect(401);
    const [log] = await audits('user.delete', u.id);
    expect(log!.after).toMatchObject({ status: 'DELETED', reason: '본인 요청으로 삭제' });
    expect((log!.before as { email: string }).email).toMatch(/^.{1,2}\*\*\*@test\.local$/);
    // 이미 삭제된 회원은 다시 다룰 수 없다
    await t.http.patch(`${A}/users/${u.id}`).set(admin.auth).send({ bio: 'x' }).expect(404);
  });

  it('refuses while trades are in progress, with the same precondition as self-deletion', async () => {
    const admin = await createUser(t, 'ADMIN');
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
    await t.http
      .post('/api/v1/orders')
      .set(buyer.auth)
      .send({ items: [{ productId: p.id, quantity: 1 }], addressId: addr.body.id })
      .expect(201);
    const res = await t.http
      .delete(`${A}/users/${buyer.id}`)
      .set(admin.auth)
      .set(await reauth(t, admin))
      .send({ reason: '테스트' })
      .expect(409);
    expect(res.body.error.code).toBe('ACCOUNT_HAS_ACTIVE_TRADES');
    expect(res.body.error.message).toContain('주문 1건');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).status).toBe('ACTIVE');
  });
});

describe('suspension period', () => {
  it('a timed suspension blocks login until it ends, then lifts on login', async () => {
    const admin = await createUser(t, 'ADMIN');
    const res = await created(admin);
    const { id, email } = res.body.user as { id: string; email: string };
    const until = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const s = await t.http
      .post(`${A}/users/${id}/suspend`)
      .set(admin.auth)
      .send({ reason: '거래 분쟁 조사', until })
      .expect(200);
    expect(s.body).toMatchObject({ status: 'SUSPENDED', suspendedUntil: until });
    const [log] = await audits('user.suspend', id);
    expect(log!.after).toMatchObject({ status: 'SUSPENDED', until, days: 3 });

    const blocked = await login(email).expect(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_RESTRICTED');
    expect(blocked.body.error.message).toContain('3일 남음');
    expect(blocked.body.error.message).toContain('거래 분쟁 조사');

    // 시간이 지난 것처럼 종료 시각을 앞당긴다
    await t.prisma.user.update({ where: { id }, data: { suspendedUntil: new Date(Date.now() - 1000) } });
    await login(email).expect(200);
    expect(await t.prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'ACTIVE',
      suspendedUntil: null,
    });
    expect(await audits('user.suspension_expired', id)).toHaveLength(1);
  });

  it('a permanent suspension stays until an admin lifts it; the worker lifts expired ones', async () => {
    const admin = await createUser(t, 'ADMIN');
    const res = await created(admin);
    const { id, email } = res.body.user as { id: string; email: string };
    await t.http.post(`${A}/users/${id}/suspend`).set(admin.auth).send({ reason: '영구 정지' }).expect(200);
    const blocked = await login(email).expect(403);
    expect(blocked.body.error.message).toContain('기간: 영구');
    await t.app.get(SuspensionScheduler).tick();
    await login(email).expect(403);
    await t.http.post(`${A}/users/${id}/restore`).set(admin.auth).send({ reason: '소명 확인' }).expect(200);
    await login(email).expect(200);

    // 워커: 기간이 지난 정지를 푼다
    const other = await createUser(t);
    await t.prisma.user.update({
      where: { id: other.id },
      data: { status: 'SUSPENDED', statusReason: 'x', suspendedUntil: new Date(Date.now() - 1000) },
    });
    await t.app.get(SuspensionScheduler).tick();
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('ACTIVE');
  });

  it('rejects an end time in the past', async () => {
    const admin = await createUser(t, 'ADMIN');
    const u = await createUser(t);
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = await t.http
      .post(`${A}/users/${u.id}/suspend`)
      .set(admin.auth)
      .send({ reason: '테스트', until: past });
    expect(r.status).toBe(400);
    expect(r.body.error.details.fields.until).toBeTruthy();
  });
});

describe('server logs', () => {
  const secretLine = (msg: string, level = 30) =>
    JSON.stringify({
      level,
      time: Date.now(),
      msg,
      req: { id: 'r1', method: 'POST', url: '/api/v1/auth/login?token=leak' },
      email: 'victim@example.com',
      password: 'hunter22',
    });

  it('only super admins read the tail; output is redacted and access is audited once per window', async () => {
    const admin = await createUser(t, 'ADMIN');
    const sa = await createUser(t, 'SUPER_ADMIN');
    await t.http.get(`${A}/logs`).set(admin.auth).expect(403);
    logBuffer.push(secretLine(`login by victim@example.com from 203.0.113.9 Bearer abc.def.ghi`));
    // 검색도 가린 뒤의 글자를 대상으로 한다 (가린 값으로는 찾을 수 없다)
    const hidden = await t.http.get(`${A}/logs`).query({ q: 'victim@' }).set(sa.auth).expect(200);
    expect(hidden.body.entries).toEqual([]);
    const res = await t.http.get(`${A}/logs`).query({ q: 'login by', limit: 5 }).set(sa.auth).expect(200);
    const last = (res.body.entries as ServerLogEntry[]).at(-1)!;
    const raw = JSON.stringify(last);
    expect(raw).not.toContain('victim@');
    expect(raw).not.toContain('hunter22');
    expect(raw).not.toContain('leak');
    expect(raw).not.toContain('abc.def.ghi');
    expect(last.msg).toContain('203.0.113.*');
    expect(res.body.capacity).toBeGreaterThan(0);
    await t.http.get(`${A}/logs`).set(sa.auth).expect(200);
    const views = await t.prisma.auditLog.count({ where: { action: 'logs.view', actorId: sa.id } });
    expect(views).toBe(1);
  });

  describe('socket stream', () => {
    let url: string;
    const sockets: Socket[] = [];
    beforeAll(async () => {
      await t.app.listen(0);
      const { port } = t.app.getHttpServer().address() as AddressInfo;
      url = `http://127.0.0.1:${port}${LOG_NAMESPACE}`;
    });
    afterEach(() => {
      for (const s of sockets.splice(0)) s.disconnect();
    });
    const connect = (token?: string) => {
      const s = io(url, {
        transports: ['websocket'],
        auth: token ? { token } : {},
        reconnection: false,
        forceNew: true,
      });
      sockets.push(s);
      return new Promise<{ s: Socket; error?: string }>((resolve) => {
        s.on('connect', () => resolve({ s }));
        s.on('connect_error', (e) => resolve({ s, error: e.message }));
      });
    };

    it('rejects anonymous, non-super-admin and excess connections', async () => {
      const admin = await createUser(t, 'ADMIN');
      const sa = await createUser(t, 'SUPER_ADMIN');
      expect((await connect()).error).toBe('UNAUTHORIZED');
      expect((await connect(admin.token)).error).toBe('FORBIDDEN');
      for (let i = 0; i < 3; i++) expect((await connect(sa.token)).error).toBeUndefined();
      expect((await connect(sa.token)).error).toBe('TOO_MANY_SUBSCRIBERS');
    });

    it('streams redacted lines matching the filter and drops the socket when the role is revoked', async () => {
      const sa = await createUser(t, 'SUPER_ADMIN');
      const sa2 = await createUser(t, 'SUPER_ADMIN');
      const { s, error } = await connect(sa.token);
      expect(error).toBeUndefined();
      const got: ServerLogEntry[] = [];
      s.on('SERVER_LOG', (p: { entries: ServerLogEntry[] }) => got.push(...p.entries));
      const ack = await s.emitWithAck('logs:filter', { level: 'warn' });
      expect(ack).toEqual({ ok: true });
      logBuffer.push(secretLine('quiet info line'));
      logBuffer.push(secretLine('loud warn by victim@example.com', 40));
      const gateway = t.app.get(AdminLogsGateway);
      gateway.flush();
      await new Promise((r) => setTimeout(r, 200));
      expect(got.map((e) => e.msg)).toEqual(['loud warn by vi***@example.com']);
      expect(JSON.stringify(got)).not.toContain('hunter22');

      const disconnected = new Promise((r) => s.on('disconnect', r));
      await t.http.patch(`${A}/users/${sa.id}/role`).set(sa2.auth).send({ role: 'ADMIN' }).expect(200);
      await gateway.recheck();
      await disconnected;
    });
  });
});
