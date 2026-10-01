import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service';
import { createTestApp, type TestContext } from './app';
import { createUser, reauth } from './fixtures';

let t: TestContext;
const ios = { name: 'iPhone 17 · iOS', platform: 'ios' as const };
const QUICK = '/api/v1/auth/quick-login';

type User = Awaited<ReturnType<typeof createUser>>;
type Credential = { credentialId: string; secret: string; expiresAt: string };

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

/** createUser 는 비밀번호 없는(소셜 전용과 같은) 계정에 방금 만든 앱 세션을 붙인다 */
async function enable(user: User, deviceId = randomUUID()) {
  const res = await t.http
    .post(`${QUICK}/register`)
    .set(user.auth)
    .send({ deviceId, deviceName: 'iPhone 17' })
    .expect(201);
  return { deviceId, cred: res.body as Credential };
}

const quickLogin = (cred: Credential, deviceId: string, device = ios) =>
  t.http.post(QUICK).send({ credentialId: cred.credentialId, secret: cred.secret, deviceId, device });

const events = (userId: string, type: string) =>
  t.prisma.securityEvent.findMany({ where: { userId, type: type as never }, orderBy: { createdAt: 'asc' } });

describe('빠른 로그인 켜기 (POST /auth/quick-login/register)', () => {
  it('로그인 직후에는 바로 켜지고, secret 은 해시로만 저장된다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    expect(cred.secret.length).toBeGreaterThanOrEqual(40);
    const row = await t.prisma.quickLoginCredential.findUniqueOrThrow({ where: { id: cred.credentialId } });
    expect(row.secretHash).not.toContain(cred.secret);
    expect(row.deviceIdHash).not.toBe(deviceId);
    // 만료는 90일
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(89 * 86_400_000);
    expect(await events(u.id, 'QUICK_LOGIN_REGISTERED')).toHaveLength(1);

    const status = await t.http.get(QUICK).query({ deviceId }).set(u.auth).expect(200);
    expect(status.body.enabled).toBe(true);
  });

  it('로그인한 지 10분이 지났으면 재인증 토큰이 필요하다', async () => {
    const u = await createUser(t);
    await t.prisma.session.update({
      where: { id: u.sessionId },
      data: { createdAt: new Date(Date.now() - 11 * 60_000) },
    });
    const body = { deviceId: randomUUID(), deviceName: 'iPhone 17' };
    const res = await t.http.post(`${QUICK}/register`).set(u.auth).send(body).expect(403);
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
    await t.http
      .post(`${QUICK}/register`)
      .set({ ...u.auth, ...(await reauth(t, u)) })
      .send(body)
      .expect(201);
  });

  it('웹 세션에서는 켤 수 없다', async () => {
    const u = await createUser(t);
    await t.prisma.session.update({ where: { id: u.sessionId }, data: { platform: 'web' } });
    await t.http
      .post(`${QUICK}/register`)
      .set(u.auth)
      .send({ deviceId: randomUUID(), deviceName: 'Chrome' })
      .expect(403);
  });

  it('다시 켜면 이전 secret 은 더 이상 쓸 수 없다', async () => {
    const u = await createUser(t);
    const first = await enable(u);
    const again = await enable(u, first.deviceId);
    expect(again.cred.credentialId).toBe(first.cred.credentialId);
    await quickLogin(first.cred, first.deviceId).expect(401);
  });
});

describe('빠른 로그인 (POST /auth/quick-login)', () => {
  it('비밀번호 없는 계정도 로그인하고, secret 을 바꿔 주며 로그인 기록을 남긴다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    const res = await quickLogin(cred, deviceId).expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.id).toBe(u.id);
    expect(res.body.quickLogin.credentialId).toBe(cred.credentialId);
    expect(res.body.quickLogin.secret).not.toBe(cred.secret);

    const login = await events(u.id, 'LOGIN');
    expect(login.at(-1)?.detail).toMatchObject({ method: 'quick', platform: 'ios' });
    // 새 secret 으로 다시 로그인할 수 있다 (사용할 때마다 교체)
    const next = await quickLogin(res.body.quickLogin, deviceId).expect(200);
    expect(next.body.quickLogin.secret).not.toBe(res.body.quickLogin.secret);
    // 받은 refresh 토큰은 일반 세션과 같다
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: next.body.refreshToken }).expect(200);
  });

  it('이미 바꾼 secret 이 다시 오면 탈취로 보고 자격과 그 기기 세션을 폐기한다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    const first = await quickLogin(cred, deviceId).expect(200);
    const replay = await quickLogin(cred, deviceId).expect(401);
    expect(replay.body.error.code).toBe('QUICK_LOGIN_INVALID');
    expect(await t.prisma.quickLoginCredential.count({ where: { id: cred.credentialId } })).toBe(0);
    // 교체 후 받은 새 secret 도, 그 로그인으로 만든 세션도 끝났다
    await quickLogin(first.body.quickLogin, deviceId).expect(401);
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
    const failed = await events(u.id, 'QUICK_LOGIN_FAILED');
    expect(failed.at(-1)?.detail).toMatchObject({ reason: 'reuse' });
  });

  it('다른 설치(기기 ID)에서 꺼낸 자격은 받지 않는다', async () => {
    const u = await createUser(t);
    const { cred } = await enable(u);
    await quickLogin(cred, randomUUID()).expect(401);
    const failed = await events(u.id, 'QUICK_LOGIN_FAILED');
    expect(failed.at(-1)?.detail).toMatchObject({ reason: 'device', locked: false });
  });

  it('secret 이 5번 틀리면 자격을 폐기한다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    const wrong = { ...cred, secret: 'x'.repeat(43) };
    for (let i = 0; i < 5; i++) await quickLogin(wrong, deviceId).expect(401);
    expect(await t.prisma.quickLoginCredential.count({ where: { id: cred.credentialId } })).toBe(0);
    await quickLogin(cred, deviceId).expect(401);
    const failed = await events(u.id, 'QUICK_LOGIN_FAILED');
    expect(failed.at(-1)?.detail).toMatchObject({ locked: true });
  });

  it('만료된 자격은 지우고 거부한다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    await t.prisma.quickLoginCredential.update({
      where: { id: cred.credentialId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await quickLogin(cred, deviceId).expect(401);
    expect(await t.prisma.quickLoginCredential.count({ where: { id: cred.credentialId } })).toBe(0);
  });

  it('이용 제한된 계정은 로그인하지 못한다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    await t.prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    const res = await quickLogin(cred, deviceId).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_RESTRICTED');
  });

  it('웹 기기로는 로그인할 수 없다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    await quickLogin(cred, deviceId, { name: 'Chrome', platform: 'web' as never }).expect(403);
  });

  it('처음 보는 기기면 일반 로그인처럼 새 기기 알림을 남긴다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    await quickLogin(cred, deviceId, { name: 'Galaxy S30 · Android', platform: 'android' as never }).expect(
      200,
    );
    expect(await events(u.id, 'NEW_DEVICE')).toHaveLength(1);
  });

  it('IP 당 분당 20회, 자격 하나당 10분에 10회로 제한한다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    // 없는 자격 ID 로 IP 한도를 채운다
    for (let i = 0; i < 20; i++)
      await quickLogin({ ...cred, credentialId: randomUUID() }, deviceId).expect(401);
    await quickLogin(cred, deviceId).expect(429);

    const keys = await t.redis.keys('rl:quick-login:*');
    await t.redis.del(...keys);
    const missing = { ...cred, credentialId: randomUUID() };
    for (let i = 0; i < 10; i++) await quickLogin(missing, deviceId).expect(401);
    await quickLogin(missing, deviceId).expect(429);
  });
});

describe('빠른 로그인 자격 폐기', () => {
  it('이 기기에서 로그아웃해도 자격은 남는다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    const login = await quickLogin(cred, deviceId).expect(200);
    await t.http.post('/api/v1/auth/logout').send({ refreshToken: login.body.refreshToken }).expect(204);
    await quickLogin(login.body.quickLogin, deviceId).expect(200);
  });

  it('끄면(DELETE) 지워지고 기록된다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    await t.http.delete(QUICK).set(u.auth).send({ deviceId }).expect(204);
    await quickLogin(cred, deviceId).expect(401);
    expect(await events(u.id, 'QUICK_LOGIN_REMOVED')).toHaveLength(1);
    const status = await t.http.get(QUICK).query({ deviceId }).set(u.auth).expect(200);
    expect(status.body).toEqual({ enabled: false, expiresAt: null });
  });

  it('기기 관리에서 그 기기를 로그아웃시키면 자격도 폐기된다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    const login = await quickLogin(cred, deviceId).expect(200);
    const list = await t.http.get('/api/v1/auth/sessions').set(u.auth).expect(200);
    const target = list.body.find((s: { current: boolean }) => !s.current);
    await t.http.delete(`/api/v1/auth/sessions/${target.id}`).set(u.auth).expect(204);
    await quickLogin(login.body.quickLogin, deviceId).expect(401);
  });

  it('다른 기기 모두 로그아웃: 이 기기 자격은 남기고 다른 기기 자격은 폐기한다', async () => {
    const u = await createUser(t);
    const mine = await enable(u);
    // 다른 기기: 빠른 로그인으로 새 세션을 만든 뒤 그 기기에서 켠 자격
    const otherDevice = randomUUID();
    const tmp = await enable(u, otherDevice);
    const other = await quickLogin(tmp.cred, otherDevice).expect(200);
    await t.http.delete('/api/v1/auth/sessions').set(u.auth).expect(204);
    await quickLogin(other.body.quickLogin, otherDevice).expect(401);
    await quickLogin(mine.cred, mine.deviceId).expect(200);
  });

  it('다른 방법으로 다시 로그인한 기기는 자격을 지금 세션에 다시 묶는다 (PATCH)', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    const login = await quickLogin(cred, deviceId).expect(200);
    // 같은 기기에서 비밀번호 등으로 다시 로그인한 세션 = 원래 세션(u). 묶지 않으면 자격은 빠른 로그인 세션을 가리킨다
    await t.http.patch(QUICK).set(u.auth).send({ deviceId }).expect(200);
    const row = await t.prisma.quickLoginCredential.findUniqueOrThrow({ where: { id: cred.credentialId } });
    const session = await t.prisma.session.findUniqueOrThrow({ where: { id: u.sessionId } });
    expect(row.familyId).toBe(session.familyId);
    // 이제 빠른 로그인으로 만든 세션을 원격 로그아웃해도 자격은 남는다
    const list = await t.http.get('/api/v1/auth/sessions').set(u.auth).expect(200);
    const target = list.body.find((s: { current: boolean }) => !s.current);
    await t.http.delete(`/api/v1/auth/sessions/${target.id}`).set(u.auth).expect(204);
    await quickLogin(login.body.quickLogin, deviceId).expect(200);
  });

  it('비밀번호를 바꾸면 이 기기 것까지 모두 폐기한다', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    await t.http
      .post('/api/v1/auth/password/change')
      .set({ ...u.auth, ...(await reauth(t, u)) })
      .send({ currentPassword: 'none', newPassword: 'abcd1234' })
      .expect(204);
    await quickLogin(cred, deviceId).expect(401);
  });
});

describe('로그아웃 + 푸시 토큰 (자동 로그인을 끈 세션의 다음 실행)', () => {
  it('refresh 토큰과 함께 보낸 푸시 토큰을 access 토큰 없이 지운다 — 그 세션 사용자의 것만', async () => {
    const u = await createUser(t);
    const { deviceId, cred } = await enable(u);
    const login = await quickLogin(cred, deviceId).expect(200);
    const mine = `ExponentPushToken[mine-${randomUUID()}]`;
    const theirs = `ExponentPushToken[theirs-${randomUUID()}]`;
    const other = await createUser(t);
    await t.prisma.pushToken.create({ data: { userId: u.id, token: mine, platform: 'ios' } });
    await t.prisma.pushToken.create({ data: { userId: other.id, token: theirs, platform: 'ios' } });

    await t.http
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken, pushToken: theirs })
      .expect(204);
    expect(await t.prisma.pushToken.count({ where: { token: theirs } })).toBe(1);

    const again = await quickLogin(login.body.quickLogin, deviceId).expect(200);
    await t.http
      .post('/api/v1/auth/logout')
      .send({ refreshToken: again.body.refreshToken, pushToken: mine })
      .expect(204);
    expect(await t.prisma.pushToken.count({ where: { token: mine } })).toBe(0);
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: again.body.refreshToken }).expect(401);
  });

  it('토큰 없이 보낸 로그아웃도 그대로 성공한다', async () => {
    await t.http.post('/api/v1/auth/logout').send({ pushToken: 'ExponentPushToken[nobody-000]' }).expect(204);
  });
});

describe('웹 로그인 상태 유지 (POST /auth/session/persistence)', () => {
  const web = { name: 'Chrome', platform: 'web' as const };
  const csrf = { 'X-Requested-With': 'shop' };
  const cookies = (res: { headers: Record<string, unknown> }) =>
    (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const rt = (list: string[]) => list.find((c) => c.startsWith('rt='))!;

  async function webLogin() {
    const u = await createUser(t);
    await t.prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await AuthService.hashPassword('abcd1234') },
    });
    const res = await t.http
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'abcd1234', device: web })
      .expect(200);
    expect(rt(cookies(res))).toMatch(/Max-Age=/);
    return cookies(res);
  }

  it('끄면 refresh 쿠키가 세션 쿠키가 되고, 회전해도 세션 쿠키로 남는다', async () => {
    const jar = await webLogin();
    await t.http
      .post('/api/v1/auth/session/persistence')
      .set('Cookie', jar)
      .send({ persistent: false })
      .expect(403);
    const off = await t.http
      .post('/api/v1/auth/session/persistence')
      .set('Cookie', jar)
      .set(csrf)
      .send({ persistent: false })
      .expect(204);
    const offCookies = cookies(off);
    expect(rt(offCookies)).not.toMatch(/Max-Age=|Expires=/);
    expect(offCookies.some((c) => c.startsWith('rts=1'))).toBe(true);

    const jar2 = offCookies.map((c) => c.split(';')[0]!);
    const refreshed = await t.http
      .post('/api/v1/auth/refresh')
      .set('Cookie', jar2)
      .set(csrf)
      .send({})
      .expect(200);
    expect(rt(cookies(refreshed))).not.toMatch(/Max-Age=|Expires=/);

    // 다시 켜면 30일 쿠키로 돌아간다
    const jar3 = [rt(cookies(refreshed)).split(';')[0]!, 'rts=1'];
    const on = await t.http
      .post('/api/v1/auth/session/persistence')
      .set('Cookie', jar3)
      .set(csrf)
      .send({ persistent: true })
      .expect(204);
    expect(rt(cookies(on))).toMatch(/Max-Age=/);
  });

  it('refresh 쿠키가 없으면 401', async () => {
    await t.http.post('/api/v1/auth/session/persistence').set(csrf).send({ persistent: false }).expect(401);
  });
});
