import { OAuthService } from '../src/auth/oauth.service';
import { PROVIDERS } from '../src/auth/oauth.providers';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser } from './fixtures';

let t: TestContext;
let n = 0;
const email = () => `user${Date.now()}${++n}@test.local`;
const web = { name: 'Chrome', platform: 'web' as const };
const ios = { name: 'iPhone 17', platform: 'ios' as const };

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  // IP 기준 rate limit 이 테스트 사이에 누적되지 않게 비운다 (한도 자체는 별도 테스트에서 확인)
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function verifiedToken(
  addr: string,
  purpose: 'SIGNUP' | 'RESET_PASSWORD' | 'DELETE_ACCOUNT' = 'SIGNUP',
) {
  await t.redis.del(`otp:gap:${purpose}:${addr}`);
  await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose }).expect(200);
  const code = t.mail.lastCode(addr)!;
  const res = await t.http
    .post('/api/v1/auth/email/verify-code')
    .send({ email: addr, purpose, code })
    .expect(200);
  return res.body.verificationToken as string;
}

async function signup(addr = email(), device: typeof web | typeof ios = ios, password = 'abcd1234') {
  const verificationToken = await verifiedToken(addr);
  const res = await t.http
    .post('/api/v1/auth/signup')
    .send({ verificationToken, password, nickname: `닉${Date.now() % 1e7}${n}`, agreeTerms: true, device })
    .expect(201);
  return { addr, password, res };
}

describe('회원가입 (Signup)', () => {
  it('이메일 인증 → 가입 → 앱은 본문으로 refresh 토큰을 받는다', async () => {
    const { res, addr } = await signup();
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user).toMatchObject({
      email: addr,
      emailVerified: true,
      hasPassword: true,
      role: 'USER',
    });
  });

  it('웹은 httpOnly 쿠키로만 refresh 토큰을 받는다', async () => {
    const { res } = await signup(email(), web);
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/rt=.+HttpOnly/);
    expect(cookie).toContain('Path=/api/v1/auth');
  });

  it('이미 가입된 이메일이면 같은 응답을 주되 인증번호 대신 안내 메일을 보낸다 (계정 열거 방지)', async () => {
    const { addr } = await signup();
    await t.redis.del(`otp:gap:SIGNUP:${addr}`);
    const before = t.mail.sent.length;
    await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose: 'SIGNUP' }).expect(200);
    const last = t.mail.sent.at(-1)!;
    expect(t.mail.sent.length).toBe(before + 1);
    expect(last.subject).toContain('이미 가입된');
    expect(last.text).not.toMatch(/\d{6}/);
  });

  it('인증번호를 5회 틀리면 잠긴다', async () => {
    const addr = email();
    await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose: 'SIGNUP' }).expect(200);
    for (let i = 0; i < 5; i++) {
      await t.http
        .post('/api/v1/auth/email/verify-code')
        .send({ email: addr, purpose: 'SIGNUP', code: '000000' });
    }
    const res = await t.http
      .post('/api/v1/auth/email/verify-code')
      .send({ email: addr, purpose: 'SIGNUP', code: t.mail.lastCode(addr) })
      .expect(400);
    expect(res.body.error.code).toBe('CODE_ATTEMPTS_EXCEEDED');
  });

  it('인증 토큰은 한 번만 쓸 수 있고, 닉네임 중복은 409', async () => {
    const addr = email();
    const token = await verifiedToken(addr);
    const body = {
      verificationToken: token,
      password: 'abcd1234',
      nickname: `중복${n}`,
      agreeTerms: true,
      device: ios,
    };
    await t.http.post('/api/v1/auth/signup').send(body).expect(201);
    await t.http.post('/api/v1/auth/signup').send(body).expect(401);
    const other = await verifiedToken(email());
    const dup = await t.http
      .post('/api/v1/auth/signup')
      .send({ ...body, verificationToken: other })
      .expect(409);
    expect(dup.body.error.code).toBe('NICKNAME_TAKEN');
  });

  it('인증번호 요청은 1분에 한 번', async () => {
    const addr = email();
    await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose: 'SIGNUP' }).expect(200);
    await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose: 'SIGNUP' }).expect(429);
  });
});

describe('로그인 · 로그아웃 · 토큰 갱신', () => {
  it('틀린 비밀번호와 없는 계정은 같은 메시지', async () => {
    const { addr } = await signup();
    const wrong = await t.http
      .post('/api/v1/auth/login')
      .send({ email: addr, password: 'nope1234', device: ios })
      .expect(401);
    const none = await t.http
      .post('/api/v1/auth/login')
      .send({ email: email(), password: 'nope1234', device: ios })
      .expect(401);
    expect(wrong.body).toEqual(none.body);
  });

  it('10회 실패하면 계정이 잠긴다', async () => {
    const { addr, password } = await signup();
    for (let i = 0; i < 10; i++) {
      await t.http.post('/api/v1/auth/login').send({ email: addr, password: 'wrong999', device: ios });
    }
    const res = await t.http
      .post('/api/v1/auth/login')
      .send({ email: addr, password, device: ios })
      .expect(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('refresh 회전: 새 토큰은 동작하고, 오래전에 회전된 토큰이 재사용되면 family 전체가 폐기된다', async () => {
    const { res } = await signup();
    const r1 = res.body.refreshToken;
    const rotated = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: r1 }).expect(200);
    const r2 = rotated.body.refreshToken;
    expect(r2).not.toBe(r1);
    // 유예 시간이 지난 뒤 탈취된 이전 토큰 재사용
    await t.prisma.session.updateMany({
      where: { userId: res.body.user.id, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: r1 }).expect(401);
    // 정상 사용자 토큰도 무효화된다
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: r2 }).expect(401);
  });

  it('여러 탭의 동시 갱신은 모두 성공하고 로그아웃되지 않는다', async () => {
    const { res } = await signup();
    const token = res.body.refreshToken;
    const results = await Promise.all(
      [0, 1, 2].map(() => t.http.post('/api/v1/auth/refresh').send({ refreshToken: token })),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    // 갱신된 토큰들은 계속 쓸 수 있다
    await t.http
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: results[2]!.body.refreshToken })
      .expect(200);
  });

  it('로그아웃한 토큰은 유예 시간 안이어도 재사용할 수 없다', async () => {
    const { res } = await signup();
    const r1 = res.body.refreshToken;
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: r1 }).expect(200);
    await t.http.post('/api/v1/auth/logout').send({ refreshToken: r1 }).expect(204);
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: r1 }).expect(401);
  });

  it('쿠키 refresh 는 CSRF 헤더가 있어야 한다', async () => {
    const { res } = await signup(email(), web);
    const cookie = res.headers['set-cookie'] as unknown as string[];
    await t.http.post('/api/v1/auth/refresh').set('Cookie', cookie).send({}).expect(403);
    const ok = await t.http
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'shop')
      .send({})
      .expect(200);
    expect(ok.body.accessToken).toBeTruthy();
  });

  it('로그아웃하면 refresh 가 거부된다', async () => {
    const { res } = await signup();
    await t.http.post('/api/v1/auth/logout').send({ refreshToken: res.body.refreshToken }).expect(204);
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(401);
  });

  it('기기 관리: 목록 ↔ 다른 기기 로그아웃', async () => {
    const { addr, password, res } = await signup();
    const other = await t.http
      .post('/api/v1/auth/login')
      .send({ email: addr, password, device: web })
      .expect(200);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const list = await t.http.get('/api/v1/auth/sessions').set(auth).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const target = list.body.find((s: { current: boolean }) => !s.current);
    await t.http.delete(`/api/v1/auth/sessions/${target.id}`).set(auth).expect(204);
    const cookie = other.headers['set-cookie'] as unknown as string[];
    await t.http
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'shop')
      .send({})
      .expect(401);
  });
});

describe('비밀번호 재설정 ↔ 변경', () => {
  it('재설정하면 모든 기기가 로그아웃되고 새 비밀번호로만 로그인된다', async () => {
    const { addr, password, res } = await signup();
    const token = await verifiedToken(addr, 'RESET_PASSWORD');
    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ verificationToken: token, newPassword: 'newpass123' })
      .expect(204);
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(401);
    await t.http.post('/api/v1/auth/login').send({ email: addr, password, device: ios }).expect(401);
    await t.http
      .post('/api/v1/auth/login')
      .send({ email: addr, password: 'newpass123', device: ios })
      .expect(200);
  });

  it('없는 이메일로 재설정 요청해도 같은 응답 (메일은 보내지 않음)', async () => {
    const addr = email();
    const before = t.mail.sent.length;
    await t.http
      .post('/api/v1/auth/email/send-code')
      .send({ email: addr, purpose: 'RESET_PASSWORD' })
      .expect(200);
    expect(t.mail.sent.length).toBe(before);
  });

  it('변경: 현재 비밀번호가 맞아야 하고 현재 기기는 유지된다', async () => {
    const { res } = await signup();
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    await t.http
      .post('/api/v1/auth/password/change')
      .set(auth)
      .send({ currentPassword: 'wrong123', newPassword: 'changed123' })
      .expect(400);
    await t.http
      .post('/api/v1/auth/password/change')
      .set(auth)
      .send({ currentPassword: 'abcd1234', newPassword: 'changed123' })
      .expect(204);
    await t.http.post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(200);
  });
});

describe('회원 탈퇴 (가입의 짝)', () => {
  it('진행 중인 거래가 있으면 막고, 없으면 익명화한다', async () => {
    const { addr, res } = await signup();
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const order = await t.prisma.order.create({
      data: {
        orderNumber: `D${Date.now()}`,
        buyerId: res.body.user.id,
        sellerId: seller.id,
        source: 'DIRECT',
        status: 'SHIPPED',
        itemsAmount: 100_000n,
        totalAmount: 100_000n,
        items: { create: { productId: p.id, titleSnapshot: p.title, unitPrice: 100_000n, quantity: 1 } },
      },
    });
    const blocked = await t.http
      .delete('/api/v1/auth/account')
      .set(auth)
      .send({ password: 'abcd1234' })
      .expect(409);
    expect(blocked.body.error.code).toBe('ACCOUNT_HAS_ACTIVE_TRADES');

    await t.prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
    await t.http.delete('/api/v1/auth/account').set(auth).send({ password: 'abcd1234' }).expect(204);
    const row = await t.prisma.user.findUniqueOrThrow({
      where: { id: res.body.user.id },
      include: { profile: true },
    });
    expect(row.status).toBe('DELETED');
    expect(row.email).not.toBe(addr);
    expect(row.profile?.nickname).toMatch(/^탈퇴회원_/);
    await t.http
      .post('/api/v1/auth/login')
      .send({ email: addr, password: 'abcd1234', device: ios })
      .expect(401);
    // 탈퇴 후 기존 access 토큰도 거부된다
    await t.http.get('/api/v1/auth/me').set(auth).expect(401);
  });
});

describe('본인인증 (PASS · PortOne) · 판매자 등록', () => {
  it('본인인증 전에는 판매자 등록 불가 → 인증 후 등록, 계좌는 마스킹', async () => {
    const { res } = await signup();
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const seller = { bankName: '예시은행', bankAccount: '110-123-456789', accountHolder: '홍길동' };
    const need = await t.http.post('/api/v1/me/seller').set(auth).send(seller).expect(403);
    expect(need.body.error.code).toBe('IDENTITY_REQUIRED');

    const prep = await t.http.post('/api/v1/identity/prepare').set(auth).expect(200);
    t.portone.results.set(prep.body.identityVerificationId, {
      status: 'VERIFIED',
      verifiedCustomer: {
        name: '홍길동',
        phoneNumber: '01012345678',
        birthDate: '1990-01-01',
        ci: `ci-${n}-${Date.now()}`,
      },
    });
    const done = await t.http
      .post('/api/v1/identity/complete')
      .set(auth)
      .send({ identityVerificationId: prep.body.identityVerificationId })
      .expect(200);
    expect(done.body).toMatchObject({
      verified: true,
      nameMasked: '홍*동',
      phoneMasked: '010-****-5678',
      isAdult: true,
    });

    const reg = await t.http.post('/api/v1/me/seller').set(auth).send(seller).expect(201);
    expect(reg.body.role).toBe('SELLER');
    const info = await t.http.get('/api/v1/me/seller').set(auth).expect(200);
    expect(info.body.bankAccountMasked).toBe('********6789');
    expect(JSON.stringify(info.body)).not.toContain('123456789');
  });

  it('같은 명의(CI)로 다른 계정 인증은 거부', async () => {
    const ci = `ci-dup-${Date.now()}`;
    for (const [i, expected] of [
      [0, 200],
      [1, 409],
    ] as const) {
      const { res } = await signup();
      const auth = { Authorization: `Bearer ${res.body.accessToken}` };
      const prep = await t.http.post('/api/v1/identity/prepare').set(auth).expect(200);
      t.portone.results.set(prep.body.identityVerificationId, {
        status: 'VERIFIED',
        verifiedCustomer: { name: '김철수', birthDate: '2000-05-05', ci },
      });
      await t.http
        .post('/api/v1/identity/complete')
        .set(auth)
        .send({ identityVerificationId: prep.body.identityVerificationId })
        .expect(expected);
      void i;
    }
  });

  it('남의 인증 ID 로 완료할 수 없다', async () => {
    const a = await signup();
    const b = await signup();
    const prep = await t.http
      .post('/api/v1/identity/prepare')
      .set({ Authorization: `Bearer ${a.res.body.accessToken}` })
      .expect(200);
    await t.http
      .post('/api/v1/identity/complete')
      .set({ Authorization: `Bearer ${b.res.body.accessToken}` })
      .send({ identityVerificationId: prep.body.identityVerificationId })
      .expect(400);
  });
});

describe('소셜 로그인 (카카오 흐름으로 공통 로직 검증)', () => {
  const redirectUri = 'http://localhost:3000/auth/callback/kakao';

  async function kakaoLogin(providerUserId: string, profileEmail: string | null, device = ios) {
    vi.spyOn(PROVIDERS.KAKAO, 'exchange').mockResolvedValue({
      providerUserId,
      email: profileEmail,
      emailVerified: !!profileEmail,
      name: '카카오유저',
    });
    const url = await t.http.get('/api/v1/auth/oauth/kakao/url').query({ redirectUri }).expect(200);
    expect(url.body.url).toContain('kauth.kakao.com');
    return t.http
      .post('/api/v1/auth/oauth/kakao/callback')
      .send({ code: 'c0de', state: url.body.state, redirectUri, device });
  }

  it('설정된 provider 만 노출된다', async () => {
    const res = await t.http.get('/api/v1/auth/providers').expect(200);
    expect(res.body.oauth).toEqual(['KAKAO']);
    expect(res.body.identity).toEqual({ storeId: 'store-test', channelKey: 'channel-test' });
    await t.http.get('/api/v1/auth/oauth/google/url').query({ redirectUri }).expect(400);
  });

  it('처음이면 가입, 다음부터는 같은 계정으로 로그인', async () => {
    const id = `k${Date.now()}`;
    const first = await kakaoLogin(id, `${id}@kakao.test`);
    expect(first.status).toBe(200);
    expect(first.body.isNewUser).toBe(true);
    const second = await kakaoLogin(id, `${id}@kakao.test`);
    expect(second.body.isNewUser).toBe(false);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.user.socialProviders).toEqual(['KAKAO']);
  });

  it('같은 이메일의 기존 계정에 자동 연결하지 않는다 (계정 탈취 방지)', async () => {
    const { addr } = await signup();
    const res = await kakaoLogin(`k2${Date.now()}`, addr);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS');
  });

  it('state 는 1회용이고 허용되지 않은 redirectUri 는 거부', async () => {
    await t.http
      .get('/api/v1/auth/oauth/kakao/url')
      .query({ redirectUri: 'https://evil.example/cb' })
      .expect(400);
    vi.spyOn(PROVIDERS.KAKAO, 'exchange').mockResolvedValue({
      providerUserId: 'x',
      email: null,
      emailVerified: false,
      name: null,
    });
    const url = await t.http.get('/api/v1/auth/oauth/kakao/url').query({ redirectUri }).expect(200);
    const body = { code: 'c', state: url.body.state, redirectUri, device: ios };
    await t.http.post('/api/v1/auth/oauth/kakao/callback').send(body).expect(200);
    await t.http.post('/api/v1/auth/oauth/kakao/callback').send(body).expect(401);
  });

  it('연결 ↔ 해제, 마지막 로그인 수단은 해제 불가', async () => {
    const id = `k3${Date.now()}`;
    const social = await kakaoLogin(id, null);
    const auth = { Authorization: `Bearer ${social.body.accessToken}` };
    const res = await t.http.delete('/api/v1/auth/social/kakao').set(auth).expect(409);
    expect(res.body.error.code).toBe('LAST_LOGIN_METHOD');
    // 비밀번호를 설정하면 해제할 수 있다 (소셜 전용 계정은 현재 비밀번호 없이 첫 설정)
    await t.http
      .post('/api/v1/auth/password/change')
      .set(auth)
      .send({ currentPassword: 'x', newPassword: 'first1234' })
      .expect(204);
    await t.http.delete('/api/v1/auth/social/kakao').set(auth).expect(204);
  });
});

describe('iOS 네이티브 Apple 계정 연결', () => {
  it('로그인해야 하고, 검증된 Apple 계정을 현재 계정에 연결한다', async () => {
    await t.http
      .post('/api/v1/auth/social/apple/native')
      .send({ identityToken: 'x'.repeat(40) })
      .expect(401);
    const { res } = await signup();
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const spy = vi.spyOn(OAuthService.prototype, 'appleProfile').mockResolvedValue({
      providerUserId: `apple${Date.now()}`,
      email: null,
      emailVerified: false,
      name: null,
    });
    await t.http
      .post('/api/v1/auth/social/apple/native')
      .set(auth)
      .send({ identityToken: 'x'.repeat(40) })
      .expect(204);
    const me = await t.http.get('/api/v1/auth/me').set(auth).expect(200);
    expect(me.body.socialProviders).toContain('APPLE');
    spy.mockRestore();
  });

  it('Apple 번들 ID 가 설정되지 않았으면 400', async () => {
    const { res } = await signup();
    const r = await t.http
      .post('/api/v1/auth/social/apple/native')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .send({ identityToken: 'x'.repeat(40) })
      .expect(400);
    expect(r.body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });
});
