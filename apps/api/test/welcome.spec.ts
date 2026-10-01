import { PROVIDERS } from '../src/auth/oauth.providers';
import { createTestApp, type TestContext } from './app';

/**
 * 가입 축하 알림 (#205): 이메일 가입 직후 · 소셜 가입 마무리(첫 동의) 직후 회원마다 한 번
 */
const ios = { name: 'iPhone 17', platform: 'ios' as const };
const redirectUri = 'http://localhost:3000/auth/callback/kakao';

let t: TestContext;
let n = 0;
const uniq = () => `${Date.now().toString(36)}${++n}`;

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
afterEach(() => {
  vi.restoreAllMocks();
});

const welcomes = (userId: string) => t.prisma.notification.findMany({ where: { userId, type: 'WELCOME' } });

/** 알림은 응답 뒤에 보내므로 생길 때까지 기다린다 */
async function waitWelcome(userId: string) {
  for (let i = 0; i < 50; i++) {
    const rows = await welcomes(userId);
    if (rows.length) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('WELCOME not created');
}

/** 보내지 않아야 하는 경우: 잠시 기다린 뒤 개수를 본다 */
const settle = () => new Promise((r) => setTimeout(r, 300));

describe('가입 축하 알림', () => {
  it('이메일 가입 → WELCOME 한 건 (홈 링크, 닉네임)', async () => {
    const addr = `welcome${uniq()}@test.local`;
    await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose: 'SIGNUP' }).expect(200);
    const verified = await t.http
      .post('/api/v1/auth/email/verify-code')
      .send({ email: addr, purpose: 'SIGNUP', code: t.mail.lastCode(addr) })
      .expect(200);
    const nickname = `환영${n}${Date.now() % 1e5}`;
    const res = await t.http
      .post('/api/v1/auth/signup')
      .send({
        verificationToken: verified.body.verificationToken,
        password: 'abcd1234',
        nickname,
        agreeTerms: true,
        agreePrivacy: true,
        ageOver14: true,
        agreeMarketing: false,
        device: ios,
      })
      .expect(201);
    const userId = res.body.user.id as string;

    const rows = await waitWelcome(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: '화소에 오신 걸 환영해요', link: '/' });
    expect(rows[0]!.body).toContain(`${nickname}님`);

    // 이미 동의한 회원이 마케팅 수신만 바꿔도 다시 보내지 않는다
    await t.http
      .post('/api/v1/me/consent')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .send({ terms: true, privacy: true, ageOver14: true, marketing: true })
      .expect(200);
    await settle();
    expect(await welcomes(userId)).toHaveLength(1);
  });

  it('소셜 첫 로그인은 동의 전에는 보내지 않고, 첫 동의 때 한 번만', async () => {
    vi.spyOn(PROVIDERS.KAKAO, 'exchange').mockResolvedValue({
      providerUserId: `kw${uniq()}`,
      email: `kw${uniq()}@kakao.test`,
      emailVerified: true,
      name: '카카오유저',
    });
    const url = await t.http.get('/api/v1/auth/oauth/kakao/url').query({ redirectUri }).expect(200);
    const login = await t.http
      .post('/api/v1/auth/oauth/kakao/callback')
      .send({ code: 'c0de', state: url.body.state as string, redirectUri, device: ios })
      .expect(200);
    expect(login.body.user.consentRequired).toBe(true);
    const userId = login.body.user.id as string;
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    await settle();
    expect(await welcomes(userId)).toHaveLength(0);

    const consent = (marketing: boolean) =>
      t.http
        .post('/api/v1/me/consent')
        .set(auth)
        .send({ terms: true, privacy: true, ageOver14: true, marketing })
        .expect(200);
    const done = await consent(false);
    expect(done.body.consentRequired).toBe(false);
    const rows = await waitWelcome(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain(`${done.body.profile.nickname}님`);

    // 마케팅 수신 동의·철회로 다시 보내도 한 번뿐
    await consent(true);
    await consent(false);
    await settle();
    expect(await welcomes(userId)).toHaveLength(1);
  });

  it('동시에 두 번 불려도 한 건만', async () => {
    const vk = `kw${uniq()}`;
    vi.spyOn(PROVIDERS.KAKAO, 'exchange').mockResolvedValue({
      providerUserId: vk,
      email: `${vk}@kakao.test`,
      emailVerified: true,
      name: '카카오유저',
    });
    const url = await t.http.get('/api/v1/auth/oauth/kakao/url').query({ redirectUri }).expect(200);
    const login = await t.http
      .post('/api/v1/auth/oauth/kakao/callback')
      .send({ code: 'c0de', state: url.body.state as string, redirectUri, device: ios })
      .expect(200);
    const userId = login.body.user.id as string;
    const body = { terms: true, privacy: true, ageOver14: true, marketing: false };
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };
    await Promise.all([
      t.http.post('/api/v1/me/consent').set(auth).send(body).expect(200),
      t.http.post('/api/v1/me/consent').set(auth).send(body).expect(200),
    ]);
    await waitWelcome(userId);
    await settle();
    expect(await welcomes(userId)).toHaveLength(1);
  });
});
