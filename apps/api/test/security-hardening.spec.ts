import { createCipheriv, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { RT_NAMESPACE } from '@shop/shared';
import { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT, type JWK } from 'jose';
import { io, type Socket } from 'socket.io-client';
import { seedAdminPassword, seedBlockedReason } from '../prisma/seed-guard';
import { AppleAuthClient } from '../src/auth/apple.client';
import { decrypt, encrypt, isCurrentKey } from '../src/common/crypto';
import { reencryptStoredSecrets } from '../src/common/key-rotation';
import { redactUrl } from '../src/common/logger';
import { isGlobalLimitExempt } from '../src/common/rate-limit';
import { type Env, env, productionSecretIssues } from '../src/config/env';
import { RealtimeService } from '../src/realtime/realtime';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, fakeUpload, reauth } from './fixtures';

/**
 * 보안 점검(#243) 회귀 테스트: 운영 비밀값 검사 · 키 교체 · 로그 마스킹 · rate limit ·
 * Apple identityToken 1회용 · 웹 푸시 SSRF · 소켓 인증/폭주 제한 · 인증서 이미지 소유권 · 게시 중지 작품 재예약 · 시드 안전장치
 */
const BUNDLE = 'kr.hwaso.sec';
const PREVIOUS_KEY = 'ab'.repeat(32);
const ios = { name: 'iPhone 17', platform: 'ios' as const };

// env() 는 앱을 만들 때 읽어 캐시한다 — 키 교체 중인 상태와 네이티브 Apple 로그인을 켠다
const previousBundle = process.env.APPLE_BUNDLE_ID;
process.env.APPLE_BUNDLE_ID = BUNDLE;
process.env.DATA_ENCRYPTION_KEY_PREVIOUS = PREVIOUS_KEY;

let t: TestContext;
let baseUrl: string;

beforeAll(async () => {
  t = await createTestApp();
  await new Promise<void>((resolve) => t.app.getHttpServer().listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => {
  await t.app.close();
  delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  if (previousBundle === undefined) delete process.env.APPLE_BUNDLE_ID;
  else process.env.APPLE_BUNDLE_ID = previousBundle;
});
beforeEach(async () => {
  const keys = await t.redis.keys('rl:*');
  if (keys.length) await t.redis.del(...keys);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('운영 비밀값 검사 (fail-closed)', () => {
  const strong: Pick<Env, 'JWT_SECRET' | 'OTP_SECRET' | 'DATA_ENCRYPTION_KEY'> = {
    JWT_SECRET: randomBytes(32).toString('hex'),
    OTP_SECRET: randomBytes(32).toString('hex'),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  const issues = (over: Partial<Env>) => productionSecretIssues({ ...strong, ...over } as Env);

  it('강한 값은 통과', () => {
    expect(issues({})).toEqual([]);
  });

  it('.env.example·CI 기본값은 거부하고 값은 메시지에 담지 않는다', () => {
    const r = issues({
      JWT_SECRET: 'dev-only-change-me-dev-only-change-me-0000',
      OTP_SECRET: 'dev-only-otp-secret-change-me-000000000000',
      DATA_ENCRYPTION_KEY: '0'.repeat(64),
    });
    expect(r).toHaveLength(3);
    expect(r.join(' ')).not.toContain('change-me');
    expect(issues({ DATA_ENCRYPTION_KEY: '1'.repeat(64) })).toHaveLength(1);
    expect(issues({ OTP_SECRET: 'e2e-otp-secret-e2e-otp-secret-00000000' })).toHaveLength(1);
  });

  it('JWT_SECRET 과 OTP_SECRET 이 같으면 거부', () => {
    expect(issues({ OTP_SECRET: strong.JWT_SECRET })).toHaveLength(1);
  });
});

describe('데이터 암호화 키 교체', () => {
  /** 이전 키로 암호화된 값 (encrypt 와 같은 형식) */
  const encryptWithPrevious = (plain: string) => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', Buffer.from(PREVIOUS_KEY, 'hex'), iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
  };

  it('이전 키 값도 복호화되고, 재암호화하면 현재 키로 바뀐다', async () => {
    expect(env().DATA_ENCRYPTION_KEY_PREVIOUS).toBe(PREVIOUS_KEY);
    const old = encryptWithPrevious('110-123-456789');
    expect(isCurrentKey(old)).toBe(false);
    expect(decrypt(old)).toBe('110-123-456789');

    const seller = await createUser(t, 'SELLER');
    await t.prisma.seller.create({
      data: {
        userId: seller.id,
        bankName: '테스트은행',
        bankAccountMasked: '*****6789',
        bankAccountEnc: old,
        accountHolder: '홍길동',
      },
    });
    const fresh = await createUser(t, 'SELLER');
    await t.prisma.seller.create({
      data: {
        userId: fresh.id,
        bankName: '테스트은행',
        bankAccountMasked: '*****0000',
        bankAccountEnc: encrypt('220-000-000000'),
        accountHolder: '김철수',
      },
    });

    const r = await reencryptStoredSecrets(t.prisma);
    expect(r.updated).toBeGreaterThanOrEqual(1);
    const row = await t.prisma.seller.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(row.bankAccountEnc).not.toBe(old);
    expect(isCurrentKey(row.bankAccountEnc)).toBe(true);
    expect(decrypt(row.bankAccountEnc)).toBe('110-123-456789');
    // 다시 돌려도 바뀌지 않는다
    const again = await reencryptStoredSecrets(t.prisma);
    expect(again.updated).toBe(0);
  });

  it('어느 키로도 열리지 않으면 거부', () => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', randomBytes(32), iv);
    const enc = Buffer.concat([c.update('x', 'utf8'), c.final()]);
    const foreign = [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
    expect(() => decrypt(foreign)).toThrow();
  });
});

describe('요청 로그 · 전역 rate limit', () => {
  it('URL 쿼리의 OAuth code·state·토큰 값을 가린다', () => {
    const url = redactUrl('/api/v1/auth/oauth/kakao/redirect?code=SECRET1&state=SECRET2&error=');
    expect(url).not.toContain('SECRET');
    expect(url).toContain('code=%5Bredacted%5D');
    expect(url).toContain('error=');
    expect(redactUrl('/api/v1/products?q=abc&sort=new')).toBe('/api/v1/products?q=abc&sort=new');
    expect(redactUrl('/api/v1/health')).toBe('/api/v1/health');
  });

  it('전역 제한 예외는 헬스체크 경로 하나뿐', () => {
    expect(isGlobalLimitExempt('/api/v1/health')).toBe(true);
    expect(isGlobalLimitExempt('/api/v1/auth/login/health')).toBe(false);
    expect(isGlobalLimitExempt('/api/v1/products/health')).toBe(false);
  });
});

describe('인증 엔드포인트 rate limit', () => {
  it('비밀번호 변경: 현재 비밀번호 대입은 사용자당 10회/10분', async () => {
    const u = await createUser(t);
    await t.prisma.user.update({ where: { id: u.id }, data: { passwordHash: 'not-a-real-hash' } });
    const headers = { ...u.auth, ...(await reauth(t, u)) };
    for (let i = 0; i < 10; i++)
      await t.http
        .post('/api/v1/auth/password/change')
        .set(headers)
        .send({ currentPassword: `guess${i}`, newPassword: 'abcd12345' })
        .expect(400);
    const r = await t.http
      .post('/api/v1/auth/password/change')
      .set(headers)
      .send({ currentPassword: 'guess-last', newPassword: 'abcd12345' })
      .expect(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
  });

  it('탈퇴 비밀번호 확인도 사용자당 10회/10분', async () => {
    const u = await createUser(t);
    const headers = { ...u.auth, ...(await reauth(t, u)) };
    for (let i = 0; i < 10; i++)
      await t.http
        .delete('/api/v1/auth/account')
        .set(headers)
        .send({ password: `guess${i}` })
        .expect(400);
    await t.http.delete('/api/v1/auth/account').set(headers).send({ password: 'guess' }).expect(429);
  });

  it('OAuth 시작(state 저장)은 IP 당 30회/분', async () => {
    const redirectUri = 'http://localhost:3000/auth/callback/kakao';
    for (let i = 0; i < 30; i++)
      await t.http.get('/api/v1/auth/oauth/kakao/url').query({ redirectUri }).expect(200);
    await t.http.get('/api/v1/auth/oauth/kakao/url').query({ redirectUri }).expect(429);
  });

  it('주문 견적(쿠폰 대입)은 사용자당 60회/분', async () => {
    const u = await createUser(t);
    for (let i = 0; i < 60; i++) await t.http.post('/api/v1/orders/quote').set(u.auth).send({}).expect(400);
    await t.http.post('/api/v1/orders/quote').set(u.auth).send({}).expect(429);
  });
});

describe('iOS 네이티브 Apple identityToken 검증', () => {
  type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let rsa: PrivateKey;
  let ec: PrivateKey;

  beforeAll(async () => {
    const r = await generateKeyPair('RS256');
    const e = await generateKeyPair('ES256');
    rsa = r.privateKey;
    ec = e.privateKey;
    const keys: JWK[] = [
      { ...(await exportJWK(r.publicKey)), kid: 'rsa', alg: 'RS256' },
      { ...(await exportJWK(e.publicKey)), kid: 'ec' },
    ];
    // Apple 공개키 대신 로컬 키 — 서명·iss·aud·exp 검증과 1회용 표시는 실제 코드로 돈다
    t.app.get(AppleAuthClient).keys = createLocalJWKSet({ keys });
  });

  const token = (sub: string, o: { aud?: string; key?: 'rsa' | 'ec'; exp?: number } = {}) =>
    new SignJWT({ email_verified: 'true' })
      .setProtectedHeader(o.key === 'ec' ? { alg: 'ES256', kid: 'ec' } : { alg: 'RS256', kid: 'rsa' })
      .setIssuer('https://appleid.apple.com')
      .setAudience(o.aud ?? BUNDLE)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? Math.floor(Date.now() / 1000) + 600)
      .sign(o.key === 'ec' ? ec : rsa);

  const login = (identityToken: string) =>
    t.http.post('/api/v1/auth/oauth/apple/native').send({ identityToken, device: ios });

  it('검증된 토큰은 한 번만 쓸 수 있다 (재전송 거부)', async () => {
    const idToken = await token(`apl-sec-${Date.now()}`);
    await login(idToken).expect(200);
    const replay = await login(idToken).expect(401);
    expect(replay.body.error.code).toBe('INVALID_TOKEN');
  });

  it('다른 대상(aud)·만료·RS256 이 아닌 서명은 거부', async () => {
    await login(await token('apl-aud', { aud: 'com.other.app' })).expect(401);
    await login(await token('apl-exp', { exp: Math.floor(Date.now() / 1000) - 60 })).expect(401);
    await login(await token('apl-ec', { key: 'ec' })).expect(401);
  });
});

describe('웹 푸시 구독 (SSRF 방지)', () => {
  const sub = (endpoint: string) =>
    JSON.stringify({ endpoint, keys: { p256dh: 'BPk'.padEnd(87, 'A'), auth: 'auth-secret-16b' } });

  it('브라우저 푸시 서비스가 아닌 endpoint 는 등록할 수 없다', async () => {
    const u = await createUser(t);
    for (const endpoint of [
      'https://10.0.0.5:8443/internal',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://localhost/x',
    ])
      await t.http
        .post('/api/v1/me/push-tokens')
        .set(u.auth)
        .send({ platform: 'web', token: sub(endpoint) })
        .expect(400);
    await t.http
      .post('/api/v1/me/push-tokens')
      .set(u.auth)
      .send({ platform: 'web', token: sub(`https://fcm.googleapis.com/fcm/send/${Date.now()}`) })
      .expect(200);
  });

  it('APNs 토큰은 hex 만 (요청 경로 주입 방지)', async () => {
    const u = await createUser(t);
    await t.http
      .post('/api/v1/me/push-tokens')
      .set(u.auth)
      .send({ platform: 'apns', token: '../../3/device/abc?x=1' })
      .expect(400);
    await t.http
      .post('/api/v1/me/push-tokens')
      .set(u.auth)
      .send({ platform: 'apns', token: randomBytes(32).toString('hex') })
      .expect(200);
  });
});

describe('실시간 소켓', () => {
  const sockets: Socket[] = [];
  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  async function connect(token?: string) {
    const s = io(`${baseUrl}${RT_NAMESPACE}`, {
      transports: ['websocket'],
      auth: token ? { token } : {},
      reconnection: false,
    });
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', resolve);
      s.once('connect_error', reject);
    });
    return s;
  }

  async function chatRoomOf(userId: string) {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    return t.prisma.chatRoom.create({ data: { productId: p.id, buyerId: userId, sellerId: seller.id } });
  }

  it('정지된 계정의 토큰으로는 개인·채팅 룸에 들어가지 못한다', async () => {
    const u = await createUser(t);
    const room = await chatRoomOf(u.id);
    const ok = await connect(u.token);
    expect(await ok.timeout(2000).emitWithAck('chat:join', { roomId: room.id })).toMatchObject({ ok: true });

    await t.prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    await t.redis.del(`user:status:${u.id}`);
    const blocked = await connect(u.token);
    expect(await blocked.timeout(2000).emitWithAck('chat:join', { roomId: room.id })).toMatchObject({
      ok: false,
    });
  });

  it('소켓당 이벤트 폭주는 처리하지 않는다', async () => {
    const s = await connect();
    const results = await Promise.allSettled(
      Array.from({ length: 60 }, () => s.timeout(1500).emitWithAck('time:sync')),
    );
    const answered = results.filter((r) => r.status === 'fulfilled').length;
    expect(answered).toBe(40);
  });

  it('한 소켓이 볼 수 있는 경매 룸은 20개까지', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, saleType: 'AUCTION' });
      const endsAt = new Date(Date.now() + 3_600_000);
      const a = await t.prisma.auction.create({
        data: {
          productId: p.id,
          sellerId: seller.id,
          status: 'LIVE',
          startPrice: 10_000n,
          bidIncrement: 1_000n,
          currentPrice: 10_000n,
          startsAt: new Date(Date.now() - 60_000),
          endsAt,
          originalEndsAt: endsAt,
          maxEndsAt: endsAt,
          extensionWindowSec: 60,
          extensionSec: 60,
        },
      });
      ids.push(a.id);
    }
    const s = await connect();
    for (const id of ids.slice(0, 20))
      expect(await s.timeout(2000).emitWithAck('auction:join', { auctionId: id })).toMatchObject({
        ok: true,
      });
    expect(await s.timeout(2000).emitWithAck('auction:join', { auctionId: ids[20]! })).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
    });
    // 이미 들어간 방은 다시 보내도 된다
    expect(await s.timeout(2000).emitWithAck('auction:join', { auctionId: ids[0]! })).toMatchObject({
      ok: true,
    });
  });

  it('로그아웃·기기 폐기 시 그 기기의 소켓을 끊도록 요청한다', async () => {
    const spy = vi.spyOn(RealtimeService.prototype, 'disconnectFamilies');
    const u = await createUser(t);
    const other = await t.prisma.session.create({
      data: {
        userId: u.id,
        refreshTokenHash: `sec-${Date.now()}`,
        familyId: `fam-other-${Date.now()}`,
        deviceName: 'Other',
        platform: 'web',
        ip: '127.0.0.1',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await t.http.delete(`/api/v1/auth/sessions/${other.familyId}`).set(u.auth).expect(204);
    expect(spy).toHaveBeenCalledWith([other.familyId]);
  });
});

describe('작품 · 경매 소유권', () => {
  it('수정 시 남이 올린 인증서 이미지를 붙일 수 없다', async () => {
    const seller = await createUser(t, 'SELLER');
    const other = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const othersKey = await fakeUpload(t, other.id);
    const r = await t.http
      .patch(`/api/v1/products/${p.id}`)
      .set(seller.auth)
      .send({ certificate: { issuer: '감정원', number: 'A-1', imageKey: othersKey } })
      .expect(400);
    expect(r.body.error.code).toBe('INVALID_IMAGE');
    const mine = await fakeUpload(t, seller.id);
    await t.http
      .patch(`/api/v1/products/${p.id}`)
      .set(seller.auth)
      .send({ certificate: { issuer: '감정원', number: 'A-1', imageKey: mine } })
      .expect(200);
  });

  it('관리자가 게시 중지한 작품은 예약 취소 → 재예약으로 다시 공개할 수 없다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await t.prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: child.id,
        title: '경매 작품',
        saleType: 'AUCTION',
        status: 'DRAFT',
      },
    });
    const startsAt = new Date(Date.now() + 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const created = await t.http
      .post('/api/v1/auctions')
      .set(seller.auth)
      .send({ productId: p.id, startPrice: 50_000, bidIncrement: 1_000, startsAt, endsAt })
      .expect(201);
    await t.http.post(`/api/v1/auctions/${created.body.id}/schedule`).set(seller.auth).expect(200);
    // 관리자 숨김
    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'SUSPENDED' } });

    await t.http.post(`/api/v1/auctions/${created.body.id}/unschedule`).set(seller.auth).expect(200);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('SUSPENDED');
    const r = await t.http.post(`/api/v1/auctions/${created.body.id}/schedule`).set(seller.auth);
    expect(r.body.error.code).toBe('PRODUCT_NOT_EDITABLE');
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('SUSPENDED');
  });
});

describe('시드 안전장치', () => {
  const url = (db: string) => `postgresql://shop:shop@localhost:5433/${db}`;

  it('운영 환경·운영 DB 에서는 명시 없이 실행하지 않는다', () => {
    expect(seedBlockedReason({ NODE_ENV: 'production', DATABASE_URL: url('shop_dev') })).toBeTruthy();
    expect(seedBlockedReason({ NODE_ENV: 'development', DATABASE_URL: url('shop') })).toContain(
      'SEED_ALLOW_PRODUCTION',
    );
    expect(
      seedBlockedReason({ NODE_ENV: 'development', DATABASE_URL: url('shop'), SEED_ALLOW_PRODUCTION: '1' }),
    ).toBeNull();
    // 명시해도 NODE_ENV=production 은 막는다
    expect(
      seedBlockedReason({ NODE_ENV: 'production', DATABASE_URL: url('shop'), SEED_ALLOW_PRODUCTION: '1' }),
    ).toBeTruthy();
    expect(seedBlockedReason({ DATABASE_URL: url('shop_e2e') })).toBeNull();
    expect(seedBlockedReason({ DATABASE_URL: `${url('shop')}?connection_limit=5` })).toBeTruthy();
  });

  it('최고 관리자는 SEED_ADMIN_PASSWORD 를 지정했을 때만 그 비밀번호를 쓴다', () => {
    expect(seedAdminPassword({ SEED_PASSWORD: 'shop1234!' })).toBeNull();
    expect(seedAdminPassword({ SEED_ADMIN_PASSWORD: '' })).toBeNull();
    expect(seedAdminPassword({ SEED_ADMIN_PASSWORD: 'Explicit-123' })).toBe('Explicit-123');
  });
});
