import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { signAccessToken } from '../src/common/auth';
import { MAX_UPLOAD_BYTES } from '../src/media/image';
import { createTestApp, type TestContext } from './app';

let t: TestContext;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

async function tokenFor(role: 'USER' | 'SELLER' = 'USER') {
  const email = `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.local`;
  const user = await t.prisma.user.create({
    data: { email, role, emailVerifiedAt: new Date(), profile: { create: { nickname: email.slice(0, 18) } } },
  });
  return signAccessToken({ id: user.id, role, sessionId: 'test' });
}

describe('공통', () => {
  it('GET /health 는 DB·Redis 상태를 확인한다', async () => {
    const res = await t.http.get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /time 은 서버 시각을 ISO 로 돌려준다', async () => {
    const res = await t.http.get('/api/v1/time').expect(200);
    expect(Math.abs(Date.parse(res.body.serverTime) - Date.now())).toBeLessThan(5000);
  });

  it('없는 경로는 통일된 에러 포맷(404)', async () => {
    const res = await t.http
      .get('/api/v1/nope')
      .set('Authorization', `Bearer ${await tokenFor()}`)
      .expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: '요청한 정보를 찾을 수 없습니다.' } });
  });

  it('모든 응답에 x-request-id 가 있다', async () => {
    const res = await t.http.get('/api/v1/time');
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,}$/);
  });

  it('위조/만료 토큰은 INVALID_TOKEN', async () => {
    const res = await t.http
      .post('/api/v1/media/images')
      .set('Authorization', 'Bearer abc.def.ghi')
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('POST /media/images', () => {
  it('로그인하지 않으면 401', async () => {
    await t.http.post('/api/v1/media/images').expect(401);
  });

  it('정상 이미지는 파생본(WebP/AVIF 3종)과 비공개 원본을 저장한다', async () => {
    const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2f7a58' } })
      .png()
      .toBuffer();
    const res = await t.http
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${await tokenFor()}`)
      .attach('file', png, { filename: 'art.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body).toMatchObject({
      width: 1200,
      height: 900,
      dominantColor: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
    const keys = [...t.s3.objects.keys()].filter((k) => k.includes(res.body.key));
    expect(keys.filter((k) => k.startsWith('public/'))).toHaveLength(6);
    expect(keys.filter((k) => k.startsWith('originals/'))).toHaveLength(1);
  });

  it('iPhone HEIC(HEVC) 도 받아 회전을 적용한 파생본을 만든다', async () => {
    const heic = readFileSync(new URL('./fixtures/oriented.heic', import.meta.url));
    const res = await t.http
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${await tokenFor()}`)
      .attach('file', heic, { filename: 'IMG_0001.HEIC', contentType: 'image/heic' })
      .expect(201);
    expect(res.body).toMatchObject({ width: 32, height: 64 });
    const keys = [...t.s3.objects.keys()].filter((k) => k.includes(res.body.key));
    expect(keys).toContain(`originals/${res.body.key}.heif`);
  });

  it('용량 상한을 넘으면 413 IMAGE_TOO_LARGE', async () => {
    const res = await t.http
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${await tokenFor()}`)
      .attach('file', Buffer.alloc(MAX_UPLOAD_BYTES + 1), { filename: 'big.jpg', contentType: 'image/jpeg' })
      .expect(413);
    expect(res.body.error.code).toBe('IMAGE_TOO_LARGE');
  });

  it('이미지로 위장한 파일(확장자·Content-Type 위조)은 거부한다', async () => {
    const res = await t.http
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${await tokenFor()}`)
      .attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'x.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it('파일이 없으면 400', async () => {
    await t.http
      .post('/api/v1/media/images')
      .set('Authorization', `Bearer ${await tokenFor()}`)
      .expect(400);
  });
});
