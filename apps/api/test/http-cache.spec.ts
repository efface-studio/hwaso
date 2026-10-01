import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser } from './fixtures';

let t: TestContext;
let productId: string;

beforeAll(async () => {
  t = await createTestApp();
  const seller = await createUser(t, 'SELLER');
  const { child } = await createCategory(t);
  // 홈 응답이 압축 기준(1KB)을 넘도록 상품을 몇 개 만든다
  const products = await Promise.all(
    Array.from({ length: 6 }, () => createProduct(t, { sellerId: seller.id, categoryId: child.id })),
  );
  productId = products[0]!.id;
});
afterAll(async () => {
  await t.app.close();
});

describe('응답 압축 (docs/API.md "캐시·압축")', () => {
  it('br 을 받는 클라이언트에는 1KB 이상 JSON 을 brotli 로 보낸다', async () => {
    const res = await t.http.get('/api/v1/home').set('Accept-Encoding', 'br, gzip').expect(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers.vary).toMatch(/Accept-Encoding/i);
    expect(res.body.newArrivals.length).toBeGreaterThan(0);
  });

  it('gzip 만 받으면 gzip', async () => {
    const res = await t.http.get('/api/v1/home').set('Accept-Encoding', 'gzip').expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('작은 응답(1KB 미만)은 압축하지 않는다', async () => {
    const res = await t.http.get('/api/v1/health').set('Accept-Encoding', 'br, gzip').expect(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});

describe('HTTP 캐시', () => {
  it('공개·사용자 무관 GET 은 짧은 public 캐시', async () => {
    const res = await t.http.get('/api/v1/categories').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
  });

  it('로그인 사용자별 값이 들어가는 응답(홈·목록·상세)에는 public 캐시를 걸지 않는다', async () => {
    for (const path of ['/api/v1/home', '/api/v1/products', `/api/v1/products/${productId}`]) {
      const res = await t.http.get(path).expect(200);
      expect(res.headers['cache-control'] ?? '').not.toMatch(/public/);
    }
  });

  it('에러 응답은 public 캐시 대신 no-store', async () => {
    const res = await t.http.get('/api/v1/notices/missing').expect(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('같은 응답은 ETag 로 304 를 돌려준다', async () => {
    const first = await t.http.get('/api/v1/categories').expect(200);
    const etag = first.headers.etag;
    expect(etag).toBeTruthy();
    await t.http.get('/api/v1/categories').set('If-None-Match', etag!).expect(304);
  });
});

describe('목록 응답 크기', () => {
  it('목록 카드에는 상세 전용 필드(관심 수)가 없고, 상세에는 있다', async () => {
    const list = await t.http.get('/api/v1/products').expect(200);
    const card = list.body.items.find((p: { id: string }) => p.id === productId);
    expect(card).toBeDefined();
    expect(card).not.toHaveProperty('favoriteCount');
    const detail = await t.http.get(`/api/v1/products/${productId}`).expect(200);
    expect(detail.body.favoriteCount).toBe(0);
  });
});
