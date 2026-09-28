import { AuthService } from '../src/auth/auth.service';
import { createTestApp, type TestContext } from './app';

// 데모 모드: 이 파일에서만 켠다 (env() 는 첫 호출 때 읽으므로 앱 생성 전에 설정)
const ACCOUNTS = [
  { login: 'demo-seller', password: 'demo1234', role: 'SELLER' },
  { login: 'demo-buyer', password: 'demo1234', role: 'USER' },
  { login: 'demo-admin@test.local', password: 'demo1234!', role: 'SUPER_ADMIN' },
];
process.env.DEMO_ACCOUNTS = JSON.stringify(ACCOUNTS);

let t: TestContext;
const web = { name: 'Chrome', platform: 'web' as const };
const login = (email: string, password: string) =>
  t.http.post('/api/v1/auth/login').send({ email, password, device: web });

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  delete process.env.DEMO_ACCOUNTS;
  await t.app.close();
});
beforeEach(async () => {
  const keys = [...(await t.redis.keys('rl:*')), ...(await t.redis.keys('login:fail:*'))];
  if (keys.length) await t.redis.del(...keys);
});

describe('데모 모드 (DEMO_ACCOUNTS)', () => {
  it('부팅 시 지정 계정을 역할·판매자 정보와 함께 만든다', async () => {
    const seller = await t.prisma.user.findUnique({
      where: { email: 'demo-seller' },
      include: { seller: true },
    });
    const admin = await t.prisma.user.findUnique({ where: { email: 'demo-admin@test.local' } });
    expect(seller?.role).toBe('SELLER');
    expect(seller?.seller).not.toBeNull();
    expect(admin?.role).toBe('SUPER_ADMIN');
  });

  it('이메일 형식이 아닌 아이디로 로그인한다', async () => {
    const res = await login('demo-seller', 'demo1234').expect(200);
    expect(res.body.user.role).toBe('SELLER');
    await login('DEMO-BUYER', 'demo1234').expect(200);
  });

  it('지정되지 않은 계정은 비밀번호가 맞아도 로그인할 수 없다', async () => {
    const email = `outsider${Date.now()}@test.local`;
    await t.prisma.user.create({
      data: {
        email,
        passwordHash: await AuthService.hashPassword('abcd1234'),
        emailVerifiedAt: new Date(),
        profile: { create: { nickname: `외부${Date.now() % 1e7}` } },
      },
    });
    const res = await login(email, 'abcd1234').expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('틀린 비밀번호를 반복해도 공개 계정이 잠기지 않는다', async () => {
    for (let i = 0; i < 12; i++) await login('demo-buyer', 'wrong-pass').expect(401);
    await login('demo-buyer', 'demo1234').expect(200);
  });

  it('가입·비밀번호·탈퇴·판매자 정보 변경은 막는다', async () => {
    const { body } = await login('demo-seller', 'demo1234').expect(200);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    const blocked = [
      t.http.post('/api/v1/auth/email/send-code').send({ email: 'x@test.local', purpose: 'SIGNUP' }),
      t.http
        .post('/api/v1/auth/password/change')
        .set(auth)
        .send({ currentPassword: 'demo1234', newPassword: 'zzzz9999' }),
      t.http.delete('/api/v1/auth/account').set(auth).send({}),
      t.http.post('/api/v1/me/seller').set(auth).send({}),
      t.http
        .get('/api/v1/auth/oauth/kakao/url')
        .query({ redirectUri: 'http://localhost:3000/auth/callback/kakao' }),
    ];
    for (const res of await Promise.all(blocked)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEMO_DISABLED');
    }
  });
});
