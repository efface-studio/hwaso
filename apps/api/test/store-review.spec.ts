import { AppleAuthClient } from '../src/auth/apple.client';
import { PROVIDERS } from '../src/auth/oauth.providers';
import { signPurposeToken } from '../src/common/auth';
import { Clock } from '../src/common/clock';
import { decrypt } from '../src/common/crypto';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, fakeUpload } from './fixtures';

/**
 * 스토어 심사 대응 (#202): 필수 동의 · Apple 토큰 폐기 · 소셜 재인증 탈퇴 · 차단 필터 · 금칙어 · 광고성 알림
 */
const BUNDLE = 'kr.hwaso.test';
const ios = { name: 'iPhone 17', platform: 'ios' as const };
const redirectUri = 'http://localhost:3000/auth/callback/kakao';

let t: TestContext;
let apple: AppleAuthClient;
let n = 0;
const uniq = () => `${Date.now().toString(36)}${++n}`;
const previousBundle = process.env.APPLE_BUNDLE_ID;

beforeAll(async () => {
  // env() 는 앱을 만들 때 읽어 캐시한다 — 네이티브 Apple 로그인을 켠다
  process.env.APPLE_BUNDLE_ID = BUNDLE;
  t = await createTestApp();
  apple = t.app.get(AppleAuthClient);
});
afterAll(async () => {
  await t.app.close();
  if (previousBundle === undefined) delete process.env.APPLE_BUNDLE_ID;
  else process.env.APPLE_BUNDLE_ID = previousBundle;
});
beforeEach(async () => {
  t.push.sent = [];
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** 카카오 OAuth 한 번 (state 발급 → 교환은 mock) */
async function kakaoGrant(providerUserId: string, email: string | null = null) {
  vi.spyOn(PROVIDERS.KAKAO, 'exchange').mockResolvedValue({
    providerUserId,
    email,
    emailVerified: !!email,
    name: '카카오유저',
  });
  const url = await t.http.get('/api/v1/auth/oauth/kakao/url').query({ redirectUri }).expect(200);
  return { code: 'c0de', state: url.body.state as string, redirectUri };
}

async function kakaoLogin(providerUserId: string, email: string | null = null) {
  const grant = await kakaoGrant(providerUserId, email);
  return t.http
    .post('/api/v1/auth/oauth/kakao/callback')
    .send({ ...grant, device: ios })
    .expect(200);
}

function mockApple(sub: string, refreshToken: string | null = `apple-refresh-${sub}`) {
  vi.spyOn(apple, 'verifyIdToken').mockResolvedValue({
    providerUserId: sub,
    email: `${sub}@privaterelay.appleid.com`,
    emailVerified: true,
    name: null,
  });
  const exchange = vi.spyOn(apple, 'exchangeCode').mockResolvedValue(refreshToken);
  const revoke = vi.spyOn(apple, 'revoke').mockResolvedValue(true);
  return { exchange, revoke };
}

const consent = (token: string, marketing = false) =>
  t.http
    .post('/api/v1/me/consent')
    .set(bearer(token))
    .send({ terms: true, privacy: true, ageOver14: true, marketing });

describe('필수 동의 (consent)', () => {
  it('소셜 첫 가입 → 동의 전 쓰기 403 → POST /me/consent → 허용', async () => {
    // provider 가 이메일을 준 회원은 이메일 인증 없이 동의만 하면 된다
    const login = await kakaoLogin(`kc${uniq()}`, `kc${uniq()}@kakao.test`);
    expect(login.body.isNewUser).toBe(true);
    expect(login.body.user).toMatchObject({ consentRequired: true, emailMissing: false });
    const auth = bearer(login.body.accessToken);
    const other = await createUser(t);

    // 읽기는 된다
    await t.http.get('/api/v1/auth/me').set(auth).expect(200);
    await t.http.get('/api/v1/notifications').set(auth).expect(200);
    // 쓰기는 막힌다
    const blocked = await t.http.post(`/api/v1/users/${other.id}/follow`).set(auth).expect(403);
    expect(blocked.body.error.code).toBe('CONSENT_REQUIRED');
    await t.http.patch('/api/v1/users/me/profile').set(auth).send({ bio: '안녕하세요' }).expect(403);
    // 인증 관련(기기 관리 등)은 동의 전에도 된다
    await t.http.delete('/api/v1/auth/sessions').set(auth).expect(204);

    // 필수 항목이 빠지면 거부
    await t.http
      .post('/api/v1/me/consent')
      .set(auth)
      .send({ terms: true, privacy: false, ageOver14: true })
      .expect(400);
    const done = await consent(login.body.accessToken, true).expect(200);
    expect(done.body).toMatchObject({ consentRequired: false, marketingOptIn: true });
    await t.http.post(`/api/v1/users/${other.id}/follow`).set(auth).expect(200);

    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: login.body.user.id } });
    expect(
      row.termsAgreedAt && row.privacyAgreedAt && row.ageConfirmedAt && row.marketingAgreedAt,
    ).toBeTruthy();

    // 다시 보내면 마케팅 수신만 바뀌고 필수 동의 시각은 유지된다
    const off = await consent(login.body.accessToken, false).expect(200);
    expect(off.body.marketingOptIn).toBe(false);
    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: login.body.user.id } });
    expect(after.termsAgreedAt).toEqual(row.termsAgreedAt);
    expect(after.marketingAgreedAt).toBeNull();
  });

  it('이메일 가입은 약관·개인정보·만 14세 동의가 모두 필요하고, 가입 즉시 동의 완료', async () => {
    const addr = `store${uniq()}@test.local`;
    await t.http.post('/api/v1/auth/email/send-code').send({ email: addr, purpose: 'SIGNUP' }).expect(200);
    const verified = await t.http
      .post('/api/v1/auth/email/verify-code')
      .send({ email: addr, purpose: 'SIGNUP', code: t.mail.lastCode(addr) })
      .expect(200);
    const body = {
      verificationToken: verified.body.verificationToken,
      password: 'abcd1234',
      nickname: `동의${n}${Date.now() % 1e5}`,
      agreeTerms: true,
      device: ios,
    };
    const missing = await t.http.post('/api/v1/auth/signup').send(body).expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');
    const ok = await t.http
      .post('/api/v1/auth/signup')
      .send({ ...body, agreePrivacy: true, ageOver14: true, agreeMarketing: true })
      .expect(201);
    expect(ok.body.user).toMatchObject({ consentRequired: false, marketingOptIn: true });
  });
});

describe('가입 마무리 (이메일 · 닉네임)', () => {
  /** SIGNUP 인증번호 받기 → 확인 → 인증 토큰 */
  async function signupToken(email: string) {
    await t.http.post('/api/v1/auth/email/send-code').send({ email, purpose: 'SIGNUP' }).expect(200);
    const res = await t.http
      .post('/api/v1/auth/email/verify-code')
      .send({ email, purpose: 'SIGNUP', code: t.mail.lastCode(email) })
      .expect(200);
    return res.body.verificationToken as string;
  }
  const finish = (token: string, extra: Record<string, unknown> = {}) =>
    t.http
      .post('/api/v1/me/consent')
      .set(bearer(token))
      .send({ terms: true, privacy: true, ageOver14: true, ...extra });

  it('이메일을 주지 않은 카카오 가입자는 이메일 인증 뒤에야 동의를 마친다', async () => {
    const login = await kakaoLogin(`km${uniq()}`, null);
    expect(login.body.user).toMatchObject({
      emailMissing: true,
      emailVerified: false,
      consentRequired: true,
    });
    const access = login.body.accessToken as string;

    const missing = await finish(access).expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');
    expect(missing.body.error.details.fields).toHaveProperty('email');

    const addr = `finish${uniq()}@test.local`;
    const token = await signupToken(addr);
    const done = await finish(access, { emailVerificationToken: token }).expect(200);
    expect(done.body).toMatchObject({
      email: addr,
      emailMissing: false,
      emailVerified: true,
      consentRequired: false,
    });
    // 같은 토큰은 다시 쓸 수 없고, 다른 용도의 인증 토큰도 받지 않는다
    const again = await finish(access, { emailVerificationToken: token }).expect(401);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
    const purpose = await signPurposeToken({ typ: 'verify', email: addr, purpose: 'DELETE_ACCOUNT' }, 600);
    await finish(access, { emailVerificationToken: purpose }).expect(401);
  });

  it('동의를 마친 회원은 이메일 없이도 마케팅 수신만 바꿀 수 있다', async () => {
    const login = await kakaoLogin(`kk${uniq()}`, null);
    await t.prisma.user.update({
      where: { id: login.body.user.id },
      data: { termsAgreedAt: new Date(), privacyAgreedAt: new Date(), ageConfirmedAt: new Date() },
    });
    const res = await finish(login.body.accessToken, { marketing: true }).expect(200);
    expect(res.body).toMatchObject({ emailMissing: true, marketingOptIn: true });
  });

  it('다른 계정이 쓰는 이메일은 ACCOUNT_EXISTS', async () => {
    const other = await createUser(t);
    const login = await kakaoLogin(`kx${uniq()}`, null);
    // 가입된 이메일로 SIGNUP 인증번호를 요청하면 안내 메일만 가므로 토큰을 직접 만든다
    const token = await signPurposeToken({ typ: 'verify', email: other.email, purpose: 'SIGNUP' }, 600);
    const res = await finish(login.body.accessToken, { emailVerificationToken: token }).expect(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(res.body.error.details.fields).toHaveProperty('email');
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: login.body.user.id } });
    expect(row.termsAgreedAt).toBeNull();
  });

  it('닉네임을 바꾸고, 사용 중이거나 부적절한 닉네임은 거부한다', async () => {
    const other = await createUser(t);
    const otherNick = (await t.prisma.profile.findUniqueOrThrow({ where: { userId: other.id } })).nickname;
    const login = await kakaoLogin(`kn${uniq()}`, `kn${uniq()}@kakao.test`);
    const access = login.body.accessToken as string;

    const taken = await finish(access, { nickname: otherNick }).expect(409);
    expect(taken.body.error.code).toBe('NICKNAME_TAKEN');
    const bad = await finish(access, { nickname: '시발놈' }).expect(400);
    expect(bad.body.error.code).toBe('PROHIBITED_CONTENT');
    // 실패하면 동의도 기록되지 않는다
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: login.body.user.id } });
    expect(before.termsAgreedAt).toBeNull();

    // 지금 닉네임 그대로 보내도 된다
    await finish(access, { nickname: login.body.user.profile.nickname }).expect(200);
    const nickname = `마무리${Date.now() % 1e6}`;
    const res = await finish(access, { nickname }).expect(200);
    expect(res.body.profile.nickname).toBe(nickname);
  });
});

describe('Sign in with Apple — 토큰 저장 · 폐기', () => {
  it('네이티브 로그인 시 authorization code 를 교환해 암호화 저장하고, 탈퇴하면 revoke 한다', async () => {
    const sub = `apl${uniq()}`;
    const { exchange, revoke } = mockApple(sub);
    const login = await t.http
      .post('/api/v1/auth/oauth/apple/native')
      .send({ identityToken: 'x'.repeat(40), authorizationCode: 'auth-code', device: ios })
      .expect(200);
    expect(login.body.user.consentRequired).toBe(true);
    expect(exchange).toHaveBeenCalledWith('auth-code', BUNDLE);

    const row = await t.prisma.socialAccount.findFirstOrThrow({
      where: { provider: 'APPLE', providerUserId: sub },
    });
    expect(row.tokenClientId).toBe(BUNDLE);
    expect(row.refreshTokenEnc).toBeTruthy();
    expect(row.refreshTokenEnc).not.toContain(`apple-refresh-${sub}`);
    expect(decrypt(row.refreshTokenEnc!)).toBe(`apple-refresh-${sub}`);

    // 비밀번호가 없는 Apple 가입자: 동의 전에도 Apple 로 다시 확인해 탈퇴할 수 있다
    await t.http
      .delete('/api/v1/auth/account')
      .set(bearer(login.body.accessToken))
      .send({ provider: 'apple', identityToken: 'y'.repeat(40) })
      .expect(204);
    expect(revoke).toHaveBeenCalledWith(`apple-refresh-${sub}`, BUNDLE);
    expect(await t.prisma.socialAccount.count({ where: { providerUserId: sub } })).toBe(0);
  });

  it('revoke 가 실패해도 탈퇴는 끝난다', async () => {
    const sub = `apl${uniq()}`;
    const { revoke } = mockApple(sub);
    revoke.mockRejectedValue(new Error('apple down'));
    const login = await t.http
      .post('/api/v1/auth/oauth/apple/native')
      .send({ identityToken: 'x'.repeat(40), authorizationCode: 'code', device: ios })
      .expect(200);
    await t.http
      .delete('/api/v1/auth/account')
      .set(bearer(login.body.accessToken))
      .send({ provider: 'APPLE', identityToken: 'y'.repeat(40) })
      .expect(204);
    expect(revoke).toHaveBeenCalled();
    const u = await t.prisma.user.findUniqueOrThrow({ where: { id: login.body.user.id } });
    expect(u.status).toBe('DELETED');
  });

  it('Apple 연결 해제 시 revoke 한다 (네이티브 연결)', async () => {
    const user = await createUser(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { passwordHash: 'set' } });
    const sub = `apl${uniq()}`;
    const { revoke } = mockApple(sub);
    await t.http
      .post('/api/v1/auth/social/apple')
      .set(user.auth)
      .send({ identityToken: 'x'.repeat(40), authorizationCode: 'link-code' })
      .expect(204);
    const me = await t.http.get('/api/v1/auth/me').set(user.auth).expect(200);
    expect(me.body.socialProviders).toEqual(['APPLE']);
    await t.http.delete('/api/v1/auth/social/apple').set(user.auth).expect(204);
    expect(revoke).toHaveBeenCalledWith(`apple-refresh-${sub}`, BUNDLE);
  });

  it('웹 OAuth 로 받은 refresh 토큰도 저장된다', async () => {
    const user = await createUser(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { passwordHash: 'set' } });
    const sub = `aplw${uniq()}`;
    vi.spyOn(PROVIDERS.APPLE, 'configured').mockReturnValue(true);
    vi.spyOn(PROVIDERS.APPLE, 'authorizeUrl').mockReturnValue('https://appleid.apple.com/auth/authorize');
    vi.spyOn(PROVIDERS.APPLE, 'exchange').mockResolvedValue({
      providerUserId: sub,
      email: null,
      emailVerified: false,
      name: null,
      revokeToken: { token: 'web-refresh', clientId: 'kr.hwaso.web' },
    });
    const webRedirect = 'http://localhost:3000/auth/callback/apple';
    const url = await t.http
      .get('/api/v1/auth/oauth/apple/url')
      .query({ redirectUri: webRedirect })
      .expect(200);
    await t.http
      .post('/api/v1/auth/social/apple')
      .set(user.auth)
      .send({ code: 'c', state: url.body.state, redirectUri: webRedirect })
      .expect(204);
    const row = await t.prisma.socialAccount.findFirstOrThrow({ where: { providerUserId: sub } });
    expect(row.tokenClientId).toBe('kr.hwaso.web');
    expect(decrypt(row.refreshTokenEnc!)).toBe('web-refresh');
  });
});

describe('소셜 재인증으로 탈퇴', () => {
  it('비밀번호·실제 이메일이 없는 카카오 가입자(@social.invalid)도 카카오로 다시 확인해 탈퇴한다', async () => {
    const kakaoId = `kd${uniq()}`;
    const login = await kakaoLogin(kakaoId, null);
    expect(login.body.user.email).toMatch(/@social\.invalid$/);
    expect(login.body.user.hasPassword).toBe(false);
    const auth = bearer(login.body.accessToken);

    // 다른 카카오 계정으로는 확인되지 않는다
    const wrong = await kakaoGrant(`other${uniq()}`);
    const denied = await t.http
      .delete('/api/v1/auth/account')
      .set(auth)
      .send({ provider: 'kakao', ...wrong })
      .expect(400);
    expect(denied.body.error.code).toBe('INVALID_CREDENTIALS');

    const grant = await kakaoGrant(kakaoId);
    await t.http
      .delete('/api/v1/auth/account')
      .set(auth)
      .send({ provider: 'kakao', ...grant })
      .expect(204);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: login.body.user.id } });
    expect(row.status).toBe('DELETED');
    await t.http.get('/api/v1/auth/me').set(auth).expect(401);
  });
});

describe('차단한 사용자의 콘텐츠 가리기', () => {
  it('작품 목록에서 빠지고, 상세는 blockedByMe, 후기·문의·판매 목록에서도 빠진다', async () => {
    const viewer = await createUser(t);
    const blocked = await createUser(t, 'SELLER');
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const hiddenWork = await createProduct(t, { sellerId: blocked.id, categoryId: child.id });
    const visibleWork = await createProduct(t, { sellerId: seller.id, categoryId: child.id });

    // blocked 가 seller 에게 남긴 후기, seller 작품에 남긴 문의
    const order = await t.prisma.order.create({
      data: {
        orderNumber: `SR${uniq()}`,
        buyerId: blocked.id,
        sellerId: seller.id,
        source: 'DIRECT',
        status: 'COMPLETED',
        itemsAmount: 100_000n,
        totalAmount: 100_000n,
        items: {
          create: {
            productId: visibleWork.id,
            titleSnapshot: visibleWork.title,
            unitPrice: 100_000n,
            quantity: 1,
          },
        },
      },
    });
    const review = await t.prisma.review.create({
      data: {
        orderId: order.id,
        authorId: blocked.id,
        targetUserId: seller.id,
        direction: 'BUYER_TO_SELLER',
        rating: 5,
        comment: '좋은 거래였어요',
      },
    });
    await t.prisma.inquiry.create({
      data: { productId: visibleWork.id, userId: blocked.id, question: '액자 포함인가요?' },
    });

    const list = (auth?: Record<string, string>) =>
      t.http
        .get('/api/v1/products')
        .query({ category: child.slug })
        .set(auth ?? {})
        .expect(200);
    const before = await list(viewer.auth);
    expect(before.body.items.map((p: { id: string }) => p.id)).toContain(hiddenWork.id);

    await t.http.post(`/api/v1/users/${blocked.id}/block`).set(viewer.auth).expect(200);

    const after = await list(viewer.auth);
    const ids = after.body.items.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(hiddenWork.id);
    expect(ids).toContain(visibleWork.id);
    // 비로그인 목록은 그대로
    expect((await list()).body.items.map((p: { id: string }) => p.id)).toContain(hiddenWork.id);

    const detail = await t.http.get(`/api/v1/products/${hiddenWork.id}`).set(viewer.auth).expect(200);
    expect(detail.body.blockedByMe).toBe(true);
    const normal = await t.http.get(`/api/v1/products/${visibleWork.id}`).set(viewer.auth).expect(200);
    expect(normal.body.blockedByMe).toBe(false);

    const reviews = await t.http.get(`/api/v1/users/${seller.id}/reviews`).set(viewer.auth).expect(200);
    expect(reviews.body.items.map((r: { id: string }) => r.id)).not.toContain(review.id);
    const publicReviews = await t.http.get(`/api/v1/users/${seller.id}/reviews`).expect(200);
    expect(publicReviews.body.items.map((r: { id: string }) => r.id)).toContain(review.id);

    const inquiries = await t.http
      .get(`/api/v1/products/${visibleWork.id}/inquiries`)
      .set(viewer.auth)
      .expect(200);
    expect(inquiries.body).toHaveLength(0);

    const sellerList = await t.http.get(`/api/v1/users/${blocked.id}/products`).set(viewer.auth).expect(200);
    expect(sellerList.body).toHaveLength(0);
  });
});

describe('금칙어 (PROHIBITED_CONTENT)', () => {
  it('닉네임·소개를 거부한다', async () => {
    const user = await createUser(t);
    const nick = await t.http
      .patch('/api/v1/users/me/profile')
      .set(user.auth)
      .send({ nickname: '시발놈' })
      .expect(400);
    expect(nick.body.error.code).toBe('PROHIBITED_CONTENT');
    expect(nick.body.error.details.fields).toHaveProperty('nickname');
    await t.http.patch('/api/v1/users/me/profile').set(user.auth).send({ bio: 'f u c k' }).expect(400);
    // 오탐 없음
    await t.http
      .patch('/api/v1/users/me/profile')
      .set(user.auth)
      .send({ bio: '근대 미술의 시발점을 모읍니다' })
      .expect(200);
  });

  it('작품 제목·설명을 거부한다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const key = await fakeUpload(t, seller.id);
    const res = await t.http
      .post('/api/v1/products')
      .set(seller.auth)
      .send({
        title: '무제',
        description: '개새끼들아',
        categoryId: child.id,
        images: [{ key }],
        saleType: 'FIXED',
        price: 10_000,
      })
      .expect(400);
    expect(res.body.error.code).toBe('PROHIBITED_CONTENT');
  });

  it('후기·문의·채팅 메시지를 거부한다', async () => {
    const buyer = await createUser(t);
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const product = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const order = await t.prisma.order.create({
      data: {
        orderNumber: `SP${uniq()}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        source: 'DIRECT',
        status: 'COMPLETED',
        itemsAmount: 100_000n,
        totalAmount: 100_000n,
        items: {
          create: { productId: product.id, titleSnapshot: product.title, unitPrice: 100_000n, quantity: 1 },
        },
      },
    });
    const review = await t.http
      .post(`/api/v1/orders/${order.id}/reviews`)
      .set(buyer.auth)
      .send({ rating: 1, comment: '병신 같은 판매자' })
      .expect(400);
    expect(review.body.error.code).toBe('PROHIBITED_CONTENT');

    const inquiry = await t.http
      .post(`/api/v1/products/${product.id}/inquiries`)
      .set(buyer.auth)
      .send({ question: 'what the fuck is this' })
      .expect(400);
    expect(inquiry.body.error.code).toBe('PROHIBITED_CONTENT');

    const room = await t.http
      .post('/api/v1/chat/rooms')
      .set(buyer.auth)
      .send({ productId: product.id })
      .expect(200);
    const chat = await t.http
      .post(`/api/v1/chat/rooms/${room.body.id}/messages`)
      .set(buyer.auth)
      .send({ kind: 'TEXT', body: 'ㅅㅂ 비싸네' })
      .expect(400);
    expect(chat.body.error.code).toBe('PROHIBITED_CONTENT');
    await t.http
      .post(`/api/v1/chat/rooms/${room.body.id}/messages`)
      .set(buyer.auth)
      .send({ kind: 'TEXT', body: '오후 3시 발송 가능할까요?' })
      .expect(201);
  });
});

describe('광고성 전체 알림 (MARKETING)', () => {
  async function waitFor(userId: string) {
    for (let i = 0; i < 40 && !(await t.prisma.notification.count({ where: { userId } })); i++)
      await new Promise((res) => setTimeout(res, 50));
  }

  /** KST 시각 → Date */
  const kst = (hour: number) => new Date(Date.UTC(2026, 9, 1, (hour + 24 - 9) % 24, 0, 0));

  it('수신 동의자에게만, (광고) 표시, 야간(21–8시 KST)에는 푸시 없이 알림함에만', async () => {
    const admin = await createUser(t, 'ADMIN');
    const optIn = await createUser(t);
    const optOut = await createUser(t);
    await t.prisma.user.update({ where: { id: optIn.id }, data: { marketingOptIn: true } });
    const clock = t.app.get(Clock);

    vi.spyOn(clock, 'now').mockReturnValue(kst(22));
    const night = await t.http
      .post('/api/v1/admin/broadcast')
      .set(admin.auth)
      .send({ title: '가을 기획전', body: '최대 20% 할인', audience: 'all', kind: 'MARKETING' })
      .expect(200);
    expect(night.body.pushed).toBe(false);
    await waitFor(optIn.id);
    const stored = await t.prisma.notification.findMany({ where: { userId: optIn.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.title).toBe('(광고) 가을 기획전');
    expect(stored[0]!.body).toContain('수신거부');
    expect(await t.prisma.notification.count({ where: { userId: optOut.id } })).toBe(0);
    expect(t.push.sent.filter((p) => p.userId === optIn.id)).toHaveLength(0);

    vi.spyOn(clock, 'now').mockReturnValue(kst(10));
    const day = await t.http
      .post('/api/v1/admin/broadcast')
      .set(admin.auth)
      .send({ title: '가을 기획전', body: '최대 20% 할인', audience: 'all', kind: 'MARKETING' })
      .expect(200);
    expect(day.body.pushed).toBe(true);
    for (let i = 0; i < 40 && !t.push.sent.some((p) => p.userId === optIn.id); i++)
      await new Promise((res) => setTimeout(res, 50));
    const pushed = t.push.sent.filter((p) => p.userId === optIn.id);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.msg.title).toBe('(광고) 가을 기획전');
    expect(t.push.sent.some((p) => p.userId === optOut.id)).toBe(false);
  });

  it('운영 공지(NOTICE, 기본값)는 야간에도 모두에게 푸시한다', async () => {
    const admin = await createUser(t, 'ADMIN');
    const target = await createUser(t, 'SELLER');
    await t.prisma.seller.create({
      data: {
        userId: target.id,
        bankName: '은행',
        bankAccountEnc: 'x',
        bankAccountMasked: '****',
        accountHolder: '홍길동',
      },
    });
    vi.spyOn(t.app.get(Clock), 'now').mockReturnValue(kst(23));
    const r = await t.http
      .post('/api/v1/admin/broadcast')
      .set(admin.auth)
      .send({ title: '긴급 점검', body: '곧 점검합니다', audience: 'sellers' })
      .expect(200);
    expect(r.body.pushed).toBe(true);
    for (let i = 0; i < 40 && !t.push.sent.some((p) => p.userId === target.id); i++)
      await new Promise((res) => setTimeout(res, 50));
    expect(t.push.sent.find((p) => p.userId === target.id)?.msg.title).toBe('긴급 점검');
  });
});
