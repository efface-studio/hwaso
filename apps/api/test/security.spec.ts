import { REAUTH_HEADER } from '@shop/shared';
import { SignJWT } from 'jose';
import { signReauthToken } from '../src/common/auth';
import { createTestApp, type TestContext } from './app';
import { createUser, reauth } from './fixtures';

let t: TestContext;
let n = 0;
const email = () => `sec${Date.now()}${++n}@test.local`;
const web = { name: 'Chrome', platform: 'web' as const };
const ios = { name: 'iPhone 17', platform: 'ios' as const };
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
type Device = { name: string; platform: 'web' | 'ios' | 'android' };

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

async function signup(device: Device = ios, password = 'abcd1234') {
  const addr = email();
  await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose: 'SIGNUP' }).expect(200);
  const verify = await t.http
    .post('/api/v1/auth/email/verify-code')
    .send({ email: addr, purpose: 'SIGNUP', code: t.mail.lastCode(addr) })
    .expect(200);
  const res = await t.http
    .post('/api/v1/auth/signup')
    .send({
      verificationToken: verify.body.verificationToken,
      password,
      nickname: `보안${Date.now() % 1e7}${n}`,
      agreeTerms: true,
      device,
    })
    .expect(201);
  return {
    addr,
    password,
    userId: res.body.user.id as string,
    access: res.body.accessToken as string,
    refresh: res.body.refreshToken as string | undefined,
  };
}

const login = (addr: string, password: string, device: Device = ios) =>
  t.http.post('/api/v1/auth/login').send({ email: addr, password, device });

const events = (userId: string, type?: string) =>
  t.prisma.securityEvent.findMany({
    where: { userId, ...(type ? { type: type as never } : {}) },
    orderBy: { createdAt: 'asc' },
  });

/** 판매자 정보 수정(정산 계좌)을 재인증 가드 확인용 엔드포인트로 쓴다 */
async function sellerOf(user: { id: string }) {
  await t.prisma.seller.create({
    data: {
      userId: user.id,
      bankName: '예시은행',
      bankAccountEnc: 'x',
      bankAccountMasked: '****1234',
      accountHolder: '홍길동',
    },
  });
}

describe('재인증 (POST /auth/reauth)', () => {
  it('비밀번호로 재인증하면 5분짜리 토큰을 주고 성공이 기록된다', async () => {
    const u = await signup();
    const res = await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(u.access))
      .send({ method: 'password', password: u.password })
      .expect(200);
    expect(res.body.reauthToken).toBeTruthy();
    const ttl = Date.parse(res.body.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(290_000);
    expect(ttl).toBeLessThanOrEqual(300_000);
    const [ev] = await events(u.userId, 'REAUTH');
    expect(ev?.detail).toEqual({ method: 'password' });

    // 발급받은 토큰으로 민감 작업(비밀번호 변경)을 할 수 있다
    await t.http
      .post('/api/v1/auth/password/change')
      .set(bearer(u.access))
      .set(REAUTH_HEADER, res.body.reauthToken)
      .send({ currentPassword: u.password, newPassword: 'changed123' })
      .expect(204);
    expect(await events(u.userId, 'PASSWORD_CHANGED')).toHaveLength(1);
  });

  it('틀린 비밀번호는 400 REAUTH_FAILED 로 거부하고 실패를 기록한다 (토큰 갱신을 유발하는 401 이 아니다)', async () => {
    const u = await signup();
    const res = await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(u.access))
      .send({ method: 'password', password: 'wrong999' })
      .expect(400);
    expect(res.body.error.code).toBe('REAUTH_FAILED');
    const failed = await events(u.userId, 'REAUTH_FAILED');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.detail).toEqual({ method: 'password' });
    expect(failed[0]!.device).toBe('iPhone 17');
    expect(await events(u.userId, 'REAUTH')).toHaveLength(0);
  });

  it('이메일 OTP: 로그인한 계정 이메일로만 보내고, 틀리면 실패 기록, 맞으면 1회용으로 소비된다', async () => {
    const u = await signup();
    await t.http.post('/api/v1/auth/reauth/code').set(bearer(u.access)).expect(200);
    const code = t.mail.lastCode(u.addr)!;
    expect(code).toMatch(/^\d{6}$/);
    expect(t.mail.sent.at(-1)!.subject).toContain('본인 확인');

    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(u.access))
      .send({ method: 'otp', code: wrong })
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_CODE');
    expect(await events(u.userId, 'REAUTH_FAILED')).toHaveLength(1);

    const ok = await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(u.access))
      .send({ method: 'otp', code })
      .expect(200);
    expect(ok.body.reauthToken).toBeTruthy();
    // 같은 코드는 다시 쓸 수 없다
    await t.http.post('/api/v1/auth/reauth').set(bearer(u.access)).send({ method: 'otp', code }).expect(400);
  });

  it('공개 인증번호 요청으로는 재인증 코드를 만들 수 없다', async () => {
    const u = await signup();
    await t.http.post('/api/v1/auth/email/send-code').send({ email: u.addr, purpose: 'REAUTH' }).expect(400);
  });

  it('재인증 시도는 사용자당 10회/10분으로 제한된다', async () => {
    const u = await signup();
    for (let i = 0; i < 10; i++)
      await t.http
        .post('/api/v1/auth/reauth')
        .set(bearer(u.access))
        .send({ method: 'password', password: 'wrong999' })
        .expect(400);
    const res = await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(u.access))
      .send({ method: 'password', password: u.password })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('생체 재인증 키', () => {
  it('등록은 재인증이 필요하고, 발급한 키로 재인증할 수 있다', async () => {
    const u = await signup();
    const denied = await t.http
      .post('/api/v1/auth/reauth/biometric')
      .set(bearer(u.access))
      .send({ deviceName: 'iPhone 17' })
      .expect(403);
    expect(denied.body.error.code).toBe('REAUTH_REQUIRED');

    const reg = await t.http
      .post('/api/v1/auth/reauth/biometric')
      .set(bearer(u.access))
      .set(await reauth(t, u.access))
      .send({ deviceName: 'iPhone 17' })
      .expect(201);
    expect(reg.body.keyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(reg.body.secret.length).toBeGreaterThanOrEqual(40);
    const row = await t.prisma.biometricKey.findUniqueOrThrow({ where: { id: reg.body.keyId } });
    expect(row.secretHash).not.toContain(reg.body.secret);
    expect(await events(u.userId, 'BIOMETRIC_REGISTERED')).toHaveLength(1);

    const ok = await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(u.access))
      .send({ method: 'biometric', keyId: reg.body.keyId, secret: reg.body.secret })
      .expect(200);
    expect(ok.body.reauthToken).toBeTruthy();

    const bad = await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(u.access))
      .send({ method: 'biometric', keyId: reg.body.keyId, secret: 'x'.repeat(43) })
      .expect(400);
    expect(bad.body.error.code).toBe('REAUTH_FAILED');
    expect((await events(u.userId, 'REAUTH_FAILED'))[0]!.detail).toEqual({ method: 'biometric' });
  });

  it('refresh 회전 후에도 같은 기기 키는 유지되고, 다시 등록하면 교체된다', async () => {
    const u = await signup();
    const first = await t.http
      .post('/api/v1/auth/reauth/biometric')
      .set(bearer(u.access))
      .set(await reauth(t, u.access))
      .send({ deviceName: 'iPhone 17' })
      .expect(201);
    const rotated = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: u.refresh }).expect(200);
    const access = rotated.body.accessToken as string;
    await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(access))
      .send({ method: 'biometric', keyId: first.body.keyId, secret: first.body.secret })
      .expect(200);

    const second = await t.http
      .post('/api/v1/auth/reauth/biometric')
      .set(bearer(access))
      .set(await reauth(t, access))
      .send({ deviceName: 'iPhone 17' })
      .expect(201);
    expect(await t.prisma.biometricKey.count({ where: { userId: u.userId } })).toBe(1);
    await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(access))
      .send({ method: 'biometric', keyId: first.body.keyId, secret: first.body.secret })
      .expect(400);
    expect(second.body.keyId).not.toBe(first.body.keyId);
  });

  it('다른 기기의 키로는 재인증할 수 없다', async () => {
    const u = await signup();
    const reg = await t.http
      .post('/api/v1/auth/reauth/biometric')
      .set(bearer(u.access))
      .set(await reauth(t, u.access))
      .send({ deviceName: 'iPhone 17' })
      .expect(201);
    const other = await login(u.addr, u.password, { name: 'Galaxy', platform: 'android' }).expect(200);
    await t.http
      .post('/api/v1/auth/reauth')
      .set(bearer(other.body.accessToken))
      .send({ method: 'biometric', keyId: reg.body.keyId, secret: reg.body.secret })
      .expect(400);
  });

  it('웹 세션에서도 등록에는 재인증이 필요하다', async () => {
    const u = await signup(web);
    const res = await t.http
      .post('/api/v1/auth/reauth/biometric')
      .set(bearer(u.access))
      .send({ deviceName: 'Chrome' })
      .expect(403);
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('기기 로그아웃·원격 로그아웃하면 그 기기의 키가 삭제되고, 해제 API 로도 지울 수 있다', async () => {
    const u = await signup();
    const reg = async (access: string) =>
      t.http
        .post('/api/v1/auth/reauth/biometric')
        .set(bearer(access))
        .set(await reauth(t, access))
        .send({ deviceName: 'd' })
        .expect(201);
    await reg(u.access);
    const other = await login(u.addr, u.password, { name: 'Galaxy', platform: 'android' }).expect(200);
    await reg(other.body.accessToken);
    expect(await t.prisma.biometricKey.count({ where: { userId: u.userId } })).toBe(2);

    // 원격 로그아웃 (iPhone 에서 Galaxy 로그아웃)
    const list = await t.http.get('/api/v1/auth/sessions').set(bearer(u.access)).expect(200);
    const galaxy = list.body.find((s: { current: boolean }) => !s.current);
    await t.http.delete(`/api/v1/auth/sessions/${galaxy.id}`).set(bearer(u.access)).expect(204);
    expect(await t.prisma.biometricKey.count({ where: { userId: u.userId } })).toBe(1);
    expect(await t.prisma.biometricKey.count({ where: { familyId: galaxy.id } })).toBe(0);
    expect((await events(u.userId, 'SESSION_REVOKED'))[0]!.detail).toMatchObject({ target: galaxy.id });

    // 해제 API
    await t.http.delete('/api/v1/auth/reauth/biometric').set(bearer(u.access)).expect(204);
    expect(await t.prisma.biometricKey.count({ where: { userId: u.userId } })).toBe(0);
    expect(await events(u.userId, 'BIOMETRIC_REMOVED')).toHaveLength(1);

    // 로그아웃
    await reg(u.access);
    await t.http.post('/api/v1/auth/logout').send({ refreshToken: u.refresh }).expect(204);
    expect(await t.prisma.biometricKey.count({ where: { userId: u.userId } })).toBe(0);
    expect(await events(u.userId, 'LOGOUT')).toHaveLength(1);
  });
});

describe('@RequireReauth 가드', () => {
  it('헤더가 없으면 403 REAUTH_REQUIRED, 맞는 토큰이면 통과하고 정산 계좌 변경이 기록된다', async () => {
    const u = await createUser(t);
    await sellerOf(u);
    const res = await t.http
      .patch('/api/v1/me/seller')
      .set(u.auth)
      .send({ businessName: '화소상점' })
      .expect(403);
    expect(res.body.error).toMatchObject({ code: 'REAUTH_REQUIRED' });

    const headers = { ...u.auth, ...(await reauth(t, u)) };
    await t.http.patch('/api/v1/me/seller').set(headers).send({ businessName: '화소상점' }).expect(200);
    expect(await events(u.id, 'SETTLEMENT_ACCOUNT_CHANGED')).toHaveLength(0);
    await t.http
      .patch('/api/v1/me/seller')
      .set(headers)
      .send({ bankName: '새은행', bankAccount: '110987654321' })
      .expect(200);
    const [ev] = await events(u.id, 'SETTLEMENT_ACCOUNT_CHANGED');
    expect(ev!.detail).toEqual({
      fields: ['bankName', 'bankAccount'],
      bankName: '새은행',
      bankAccountMasked: '********4321',
    });
    expect(JSON.stringify(ev!.detail)).not.toContain('110987654321');
  });

  it('소셜 계정 연결도 재인증이 필요하다 (가로챈 계정에 로그인 수단을 심지 못하게)', async () => {
    const u = await createUser(t);
    const res = await t.http
      .post('/api/v1/auth/social/kakao')
      .set(u.auth)
      .send({ code: 'c', state: 's', redirectUri: 'hwaso://auth/callback' })
      .expect(403);
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('만료된 토큰 · 다른 사용자의 토큰 · 다른 기기(세션)의 토큰 · access 토큰은 거부한다', async () => {
    const u = await createUser(t);
    await sellerOf(u);
    const session = await t.prisma.session.findUniqueOrThrow({ where: { id: u.sessionId } });
    const patch = (token: string) =>
      t.http.patch('/api/v1/me/seller').set(u.auth).set(REAUTH_HEADER, token).send({ businessName: 'x' });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ typ: 'reauth', sid: session.id, fam: session.familyId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(u.id)
      .setIssuer('efface-shop')
      .setAudience('reauth')
      .setIssuedAt(now - 600)
      .setExpirationTime(now - 1)
      .sign(secret);

    const other = await createUser(t);
    const otherToken = (await reauth(t, other))[REAUTH_HEADER];
    // 같은 사용자, 다른 기기 세션
    const { reauthToken: otherSession } = await signReauthToken({
      userId: u.id,
      sessionId: 'other',
      familyId: 'fam-other-device',
    });

    for (const token of [expired, otherToken, otherSession, u.token, 'garbage']) {
      const res = await patch(token).expect(403);
      expect(res.body.error.code).toBe('REAUTH_REQUIRED');
    }
    await patch((await reauth(t, u))[REAUTH_HEADER]).expect(200);
  });

  it('재인증 토큰은 access 토큰으로 쓸 수 없다', async () => {
    const u = await createUser(t);
    const token = (await reauth(t, u))[REAUTH_HEADER];
    await t.http.get('/api/v1/auth/me').set(bearer(token)).expect(401);
  });

  it('refresh 회전 후에도 같은 기기의 재인증 토큰은 유효하다', async () => {
    const u = await signup();
    const header = await reauth(t, u.access);
    const rotated = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: u.refresh }).expect(200);
    await t.http
      .post('/api/v1/auth/password/change')
      .set(bearer(rotated.body.accessToken))
      .set(header)
      .send({ currentPassword: u.password, newPassword: 'rotated123' })
      .expect(204);
  });

  it('웹 세션은 아직 재인증 UI 가 없어 요구하지 않는다', async () => {
    const u = await signup(web);
    await t.http
      .post('/api/v1/auth/password/change')
      .set(bearer(u.access))
      .send({ currentPassword: u.password, newPassword: 'webpass123' })
      .expect(204);
  });
});

describe('access 토큰 즉시 폐기', () => {
  it('로그아웃하면 그 기기의 access 토큰이 바로 거부된다', async () => {
    const u = await signup();
    await t.http.get('/api/v1/auth/me').set(bearer(u.access)).expect(200);
    await t.http.post('/api/v1/auth/logout').send({ refreshToken: u.refresh }).expect(204);
    const res = await t.http.get('/api/v1/auth/me').set(bearer(u.access)).expect(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('원격 로그아웃 · 다른 기기 전체 로그아웃 · 비밀번호 변경은 다른 기기의 access 토큰을 바로 거부한다', async () => {
    const u = await signup();
    const a = await login(u.addr, u.password, web).expect(200);
    const b = await login(u.addr, u.password, { name: 'Galaxy', platform: 'android' }).expect(200);
    const c = await login(u.addr, u.password, { name: 'iPad', platform: 'ios' }).expect(200);

    const list = await t.http.get('/api/v1/auth/sessions').set(bearer(u.access)).expect(200);
    const aId = (await t.prisma.session.findFirstOrThrow({ where: { userId: u.userId, platform: 'web' } }))
      .familyId;
    expect(list.body.some((s: { id: string }) => s.id === aId)).toBe(true);
    await t.http.delete(`/api/v1/auth/sessions/${aId}`).set(bearer(u.access)).expect(204);
    await t.http.get('/api/v1/auth/me').set(bearer(a.body.accessToken)).expect(401);
    await t.http.get('/api/v1/auth/me').set(bearer(b.body.accessToken)).expect(200);

    await t.http.delete('/api/v1/auth/sessions').set(bearer(u.access)).expect(204);
    await t.http.get('/api/v1/auth/me').set(bearer(b.body.accessToken)).expect(401);
    await t.http.get('/api/v1/auth/me').set(bearer(c.body.accessToken)).expect(401);
    await t.http.get('/api/v1/auth/me').set(bearer(u.access)).expect(200);

    const d = await login(u.addr, u.password, { name: 'Galaxy', platform: 'android' }).expect(200);
    await t.http
      .post('/api/v1/auth/password/change')
      .set(bearer(u.access))
      .set(await reauth(t, u.access))
      .send({ currentPassword: u.password, newPassword: 'newpass123' })
      .expect(204);
    await t.http.get('/api/v1/auth/me').set(bearer(d.body.accessToken)).expect(401);
    await t.http.get('/api/v1/auth/me').set(bearer(u.access)).expect(200);
  });
});

describe('로그인 기록 · 새 기기 알림', () => {
  it('처음 보는 기기로 로그인하면 기록 + 알림 + 메일, 같은 기기로 다시 로그인하면 알리지 않는다', async () => {
    const u = await signup(ios);
    // 가입 자체는 새 기기로 보지 않는다
    expect(await events(u.userId, 'NEW_DEVICE')).toHaveLength(0);
    expect(await events(u.userId, 'LOGIN')).toHaveLength(1);

    const mails = t.mail.sent.length;
    await login(u.addr, u.password, web).expect(200);
    const [nd] = await events(u.userId, 'NEW_DEVICE');
    expect(nd).toMatchObject({ device: 'Chrome', detail: { platform: 'web' } });
    expect(nd!.sessionId).toBeTruthy();
    const noti = await t.prisma.notification.findMany({
      where: { userId: u.userId, type: 'SECURITY_NEW_DEVICE' },
    });
    expect(noti).toHaveLength(1);
    expect(noti[0]!.body).toContain('Chrome');
    expect(t.push.sent.some((p) => p.userId === u.userId)).toBe(true);
    const mail = t.mail.sent.slice(mails).find((m) => m.to === u.addr);
    expect(mail?.subject).toContain('새 기기');

    await login(u.addr, u.password, web).expect(200);
    await login(u.addr, u.password, ios).expect(200);
    expect(await events(u.userId, 'NEW_DEVICE')).toHaveLength(1);
    expect(
      await t.prisma.notification.count({ where: { userId: u.userId, type: 'SECURITY_NEW_DEVICE' } }),
    ).toBe(1);
    expect(await events(u.userId, 'LOGIN')).toHaveLength(4);
  });

  it('90일 넘게 쓰지 않은 기기는 다시 새 기기로 본다', async () => {
    const u = await signup(ios);
    await login(u.addr, u.password, web).expect(200);
    await t.prisma.session.updateMany({
      where: { userId: u.userId, platform: 'web' },
      data: { createdAt: new Date(Date.now() - 91 * 86_400_000) },
    });
    await login(u.addr, u.password, web).expect(200);
    expect(await events(u.userId, 'NEW_DEVICE')).toHaveLength(2);
  });

  it('비밀번호가 틀리면 LOGIN_FAILED 를 남긴다 (없는 계정은 남기지 않는다)', async () => {
    const u = await signup();
    await login(u.addr, 'wrong999').expect(401);
    await login(email(), 'wrong999').expect(401);
    // 실패 기록은 응답을 기다리게 하지 않으므로 잠시 기다린다
    let failed = await events(u.userId, 'LOGIN_FAILED');
    for (let i = 0; i < 40 && !failed.length; i++) {
      await new Promise((r) => setTimeout(r, 25));
      failed = await events(u.userId, 'LOGIN_FAILED');
    }
    const [ev] = failed;
    expect(ev).toMatchObject({ device: 'iPhone 17' });
    expect(ev!.ip).toBeTruthy();
  });
});

describe('기기 무결성 신고', () => {
  it('신호가 있으면 경고를 남기고, 같은 기기·같은 신호는 24시간에 한 번만 남긴다', async () => {
    const u = await createUser(t);
    const report = (flags: string[]) =>
      t.http
        .post('/api/v1/me/security/integrity')
        .set(u.auth)
        .send({ platform: 'ios', flags, appVersion: '1.2.0' })
        .expect(204);
    await report([]);
    expect(await events(u.id, 'INTEGRITY_WARNING')).toHaveLength(0);

    await report(['jailbroken', 'debugger']);
    await report(['debugger', 'jailbroken']);
    await report(['jailbroken', 'debugger', 'jailbroken']);
    const warned = await events(u.id, 'INTEGRITY_WARNING');
    expect(warned).toHaveLength(1);
    expect(warned[0]!.detail).toEqual({
      platform: 'ios',
      flags: ['debugger', 'jailbroken'],
      appVersion: '1.2.0',
    });

    await report(['hooked']);
    expect(await events(u.id, 'INTEGRITY_WARNING')).toHaveLength(2);

    await t.http
      .post('/api/v1/me/security/integrity')
      .set(u.auth)
      .send({ platform: 'ios', flags: ['rooted'], appVersion: '1' })
      .expect(400);
  });
});

describe('보안 기록 조회 (GET /me/security/events)', () => {
  it('내 기록만 최신순으로 30개씩, IP 는 마스킹', async () => {
    const me = await createUser(t);
    const other = await createUser(t);
    const base = Date.now() - 100_000;
    await t.prisma.securityEvent.createMany({
      data: Array.from({ length: 35 }, (_, i) => ({
        userId: me.id,
        type: 'LOGIN' as const,
        ip: '203.0.113.45',
        device: `d${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    });
    await t.prisma.securityEvent.create({ data: { userId: other.id, type: 'LOGIN', device: 'other' } });

    const p1 = await t.http.get('/api/v1/me/security/events').set(me.auth).expect(200);
    expect(p1.body.items).toHaveLength(30);
    expect(p1.body.items[0]).toMatchObject({ type: 'LOGIN', device: 'd34', ip: '203.0.113.*', detail: null });
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await t.http
      .get('/api/v1/me/security/events')
      .query({ cursor: p1.body.nextCursor })
      .set(me.auth)
      .expect(200);
    expect(p2.body.items.map((e: { device: string }) => e.device)).toEqual(['d4', 'd3', 'd2', 'd1', 'd0']);
    expect(p2.body.nextCursor).toBeNull();

    const theirs = await t.http.get('/api/v1/me/security/events').set(other.auth).expect(200);
    expect(theirs.body.items.map((e: { device: string }) => e.device)).toEqual(['other']);
    // 남의 커서를 넣어도 남의 기록이 섞이지 않는다
    const cross = await t.http
      .get('/api/v1/me/security/events')
      .query({ cursor: p1.body.nextCursor })
      .set(other.auth)
      .expect(200);
    expect(cross.body.items.every((e: { device: string }) => e.device === 'other')).toBe(true);
  });
});
