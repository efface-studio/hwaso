import { CATEGORY_CACHE_KEY } from '../src/catalog/catalog.controller';
import { HOME_CACHE_KEY, ProductsService } from '../src/products/products.service';
import { createTestApp, type TestContext } from './app';
import { createCategory, createProduct, createUser, fakeUpload } from './fixtures';

let t: TestContext;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

describe('상품 조회 (Read)', () => {
  it('공개 상품만 목록에 나오고, 카테고리 slug 는 하위 카테고리를 포함한다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { parent, child } = await createCategory(t);
    const visible = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'DRAFT' });
    await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'HIDDEN' });

    const res = await t.http.get(`/api/v1/products?category=${parent.slug}`).expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([visible.id]);
    expect(res.body.total).toBe(1);
  });

  it('가격 필터와 정렬, 커서 페이지네이션', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    for (const price of [50_000, 150_000, 300_000, 900_000]) {
      await createProduct(t, { sellerId: seller.id, categoryId: child.id, price });
    }
    const q = `category=${child.slug}&minPrice=100000&sort=price_asc&limit=2`;
    const page1 = await t.http.get(`/api/v1/products?${q}`).expect(200);
    expect(page1.body.items.map((i: { price: number }) => i.price)).toEqual([150_000, 300_000]);
    expect(page1.body.total).toBe(3);
    const page2 = await t.http.get(`/api/v1/products?${q}&cursor=${page1.body.nextCursor}`).expect(200);
    expect(page2.body.items.map((i: { price: number }) => i.price)).toEqual([900_000]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('검색어는 제목·작가를 찾고 관련도순으로 정렬한다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const exact = await createProduct(t, { sellerId: seller.id, categoryId: child.id, title: '달항아리' });
    const partial = await createProduct(t, {
      sellerId: seller.id,
      categoryId: child.id,
      title: '작은 달항아리 한 쌍',
    });
    const res = await t.http
      .get(`/api/v1/products?q=${encodeURIComponent('달항아리')}&sort=relevance`)
      .expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids.indexOf(exact.id)).toBeLessThan(ids.indexOf(partial.id));
  });

  it('검색어는 작가 영문명·제작자·카테고리·판매자 닉네임도 찾고, 필드 경계를 넘는 일치는 찾지 않는다', async () => {
    const tag = `q${Date.now().toString(36)}`;
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const make = () => createProduct(t, { sellerId: seller.id, categoryId: child.id });

    const artist = await t.prisma.artist.create({ data: { name: '홍길동', nameEn: `Hong ${tag}` } });
    const byArtist = await make();
    await t.prisma.product.update({ where: { id: byArtist.id }, data: { artistId: artist.id } });
    const byMaker = await make();
    await t.prisma.product.update({ where: { id: byMaker.id }, data: { maker: `공방 ${tag}` } });
    const acrossFields = await make();
    await t.prisma.product.update({
      where: { id: acrossFields.id },
      data: { maker: `${tag}A`, brand: `B${tag}` },
    });
    const category = await t.prisma.category.create({
      data: { slug: `c-${tag}`, name: `분류${tag}`, group: 'ART', parentId: child.parentId },
    });
    const byCategory = await createProduct(t, { sellerId: seller.id, categoryId: category.id });
    const nick = await createUser(t, 'SELLER');
    await t.prisma.profile.update({ where: { userId: nick.id }, data: { nickname: `n${tag}` } });
    const bySeller = await createProduct(t, { sellerId: nick.id, categoryId: child.id });
    const draft = await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'DRAFT' });
    await t.prisma.product.update({ where: { id: draft.id }, data: { title: `초안 ${tag}` } });

    const res = await t.http.get('/api/v1/products').query({ q: tag.toUpperCase(), limit: 50 }).expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id).toSorted()).toEqual(
      [byArtist.id, byMaker.id, acrossFields.id, byCategory.id, bySeller.id].toSorted(),
    );
    expect(res.body.total).toBe(5);
    // 제작자 끝과 브랜드 앞을 이어 붙인 문자열은 어느 한 필드에도 없다
    const across = await t.http
      .get('/api/v1/products')
      .query({ q: `${tag}A B${tag}` })
      .expect(200);
    expect(across.body.total).toBe(0);
  });

  it('인기 작가: 공개 작품의 (관심 수 + 5) 합계순, 대표 이미지는 관심이 가장 많은 작품의 첫 이미지 (5분 캐시)', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const tag = Date.now().toString(36);
    const [a, b] = await Promise.all([
      t.prisma.artist.create({ data: { name: `인기A${tag}` } }),
      t.prisma.artist.create({ data: { name: `인기B${tag}` } }),
    ]);
    const work = async (artistId: string, favoriteCount: number, status?: 'DRAFT') => {
      const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, status });
      await t.prisma.product.update({ where: { id: p.id }, data: { artistId, favoriteCount } });
      return p;
    };
    const aTop = await work(a.id, 900_000);
    await work(a.id, 100_000);
    await work(a.id, 5_000_000, 'DRAFT'); // 비공개 작품은 세지 않는다
    await work(b.id, 2_000_000);
    await t.redis.del('artists:popular:20');

    const res = await t.http.get('/api/v1/artists/popular').expect(200);
    const ids = res.body.map((x: { id: string }) => x.id);
    expect(ids.slice(0, 2)).toEqual([b.id, a.id]);
    const aImage = await t.prisma.productImage.findFirstOrThrow({ where: { productId: aTop.id } });
    expect(res.body[1]).toMatchObject({
      name: a.name,
      productCount: 2,
      image: { key: aImage.key, width: aImage.width, height: aImage.height },
    });

    await work(a.id, 9_000_000);
    const cached = await t.http.get('/api/v1/artists/popular').expect(200);
    expect(cached.body.map((x: { id: string }) => x.id).slice(0, 2)).toEqual([b.id, a.id]);
  });

  it('상세는 판매자 공개 정보만 포함한다 (이메일 비노출)', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const res = await t.http.get(`/api/v1/products/${p.id}`).expect(200);
    expect(res.body.seller.id).toBe(seller.id);
    expect(JSON.stringify(res.body)).not.toContain(seller.email);
    expect(res.body.isMine).toBe(false);
  });

  it('비공개 상품 상세는 본인만 볼 수 있다', async () => {
    const seller = await createUser(t, 'SELLER');
    const other = await createUser(t);
    const { child } = await createCategory(t);
    const draft = await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'DRAFT' });
    await t.http.get(`/api/v1/products/${draft.id}`).set(other.auth).expect(404);
    const mine = await t.http.get(`/api/v1/products/${draft.id}`).set(seller.auth).expect(200);
    expect(mine.body.isMine).toBe(true);
  });

  it('잘못된 쿼리(음수 가격, 허용 외 정렬)는 400', async () => {
    await t.http.get('/api/v1/products?minPrice=-1').expect(400);
    await t.http.get('/api/v1/products?sort=hacker').expect(400);
  });
});

describe('상품 등록·수정·삭제 (Create / Update / Delete)', () => {
  const body = (categoryId: string, key: string) => ({
    title: '무제',
    categoryId,
    images: [{ key }],
    saleType: 'FIXED',
    price: 1_200_000,
    artistName: '테스트 작가',
  });

  it('판매자 등록 전에는 등록할 수 없다', async () => {
    const user = await createUser(t);
    const { child } = await createCategory(t);
    const key = await fakeUpload(t, user.id);
    const res = await t.http.post('/api/v1/products').set(user.auth).send(body(child.id, key)).expect(403);
    expect(res.body.error.code).toBe('SELLER_REQUIRED');
  });

  it('남이 올린 이미지 키는 쓸 수 없다', async () => {
    const seller = await createUser(t, 'SELLER');
    const other = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const key = await fakeUpload(t, other.id);
    await t.http.post('/api/v1/products').set(seller.auth).send(body(child.id, key)).expect(400);
  });

  it('등록하면 바로 게시되고 작가가 생성된다. 허용 외 필드(status)는 거부', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const key = await fakeUpload(t, seller.id);
    await t.http
      .post('/api/v1/products')
      .set(seller.auth)
      .send({ ...body(child.id, key), status: 'SOLD' })
      .expect(400);
    const res = await t.http.post('/api/v1/products').set(seller.auth).send(body(child.id, key)).expect(201);
    expect(res.body.status).toBe('ACTIVE');
    const detail = await t.http.get(`/api/v1/products/${res.body.id}`).expect(200);
    expect(detail.body.artist.name).toBe('테스트 작가');
    expect(detail.body.price).toBe(1_200_000);
  });

  it('다른 판매자는 수정·삭제할 수 없다 (존재 여부도 숨김)', async () => {
    const seller = await createUser(t, 'SELLER');
    const other = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await t.http.patch(`/api/v1/products/${p.id}`).set(other.auth).send({ title: '가로채기' }).expect(404);
    await t.http.delete(`/api/v1/products/${p.id}`).set(other.auth).expect(404);
  });

  it('수정: 가격 변경 시 표시 가격(listPrice)도 바뀐다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, price: 100_000 });
    const res = await t.http
      .patch(`/api/v1/products/${p.id}`)
      .set(seller.auth)
      .send({ price: 80_000 })
      .expect(200);
    expect(res.body.priceChanged).toBe(true);
    const row = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.listPrice).toBe(80_000n);
  });

  it('판매 완료 상품은 수정할 수 없다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'SOLD' });
    const res = await t.http
      .patch(`/api/v1/products/${p.id}`)
      .set(seller.auth)
      .send({ title: 'x 수정' })
      .expect(409);
    expect(res.body.error.code).toBe('PRODUCT_NOT_EDITABLE');
  });

  it('판매 중지 ↔ 재개', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await t.http.post(`/api/v1/products/${p.id}/pause`).set(seller.auth).expect(204);
    await t.http.get(`/api/v1/products/${p.id}`).expect(404);
    await t.http.post(`/api/v1/products/${p.id}/pause`).set(seller.auth).expect(409);
    await t.http.post(`/api/v1/products/${p.id}/resume`).set(seller.auth).expect(204);
    await t.http.get(`/api/v1/products/${p.id}`).expect(200);
  });

  it('진행 중인 주문이 있으면 삭제할 수 없고, 없으면 soft delete', async () => {
    const seller = await createUser(t, 'SELLER');
    const buyer = await createUser(t);
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const order = await t.prisma.order.create({
      data: {
        orderNumber: `T${Date.now()}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        source: 'DIRECT',
        status: 'PAID',
        itemsAmount: 100_000n,
        totalAmount: 100_000n,
        items: { create: { productId: p.id, titleSnapshot: p.title, unitPrice: 100_000n, quantity: 1 } },
      },
    });
    await t.http.delete(`/api/v1/products/${p.id}`).set(seller.auth).expect(409);
    await t.prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
    await t.http.delete(`/api/v1/products/${p.id}`).set(seller.auth).expect(204);
    const row = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.deletedAt).not.toBeNull();
  });
});

describe('관심상품 · 최근 본 상품 · 문의', () => {
  it('관심 추가는 멱등이고 해제하면 카운트가 돌아온다', async () => {
    const seller = await createUser(t, 'SELLER');
    const user = await createUser(t);
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await t.http.post(`/api/v1/products/${p.id}/favorite`).set(user.auth).expect(204);
    await t.http.post(`/api/v1/products/${p.id}/favorite`).set(user.auth).expect(204);
    let row = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.favoriteCount).toBe(1);
    const list = await t.http.get('/api/v1/me/favorites').set(user.auth).expect(200);
    expect(list.body[0]).toMatchObject({ id: p.id, isFavorite: true });
    await t.http.delete(`/api/v1/products/${p.id}/favorite`).set(user.auth).expect(204);
    row = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.favoriteCount).toBe(0);
  });

  it('조회 기록 → 최근 본 상품 → 전체 삭제', async () => {
    const seller = await createUser(t, 'SELLER');
    const user = await createUser(t);
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await t.http.post(`/api/v1/products/${p.id}/view`).set(user.auth).expect(204);
    await t.http.post(`/api/v1/products/${p.id}/view`).set(user.auth).expect(204);
    const row = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.viewCount).toBe(1);
    const recent = await t.http.get('/api/v1/me/recent').set(user.auth).expect(200);
    expect(recent.body.map((r: { id: string }) => r.id)).toContain(p.id);
    await t.http.delete('/api/v1/me/recent').set(user.auth).expect(204);
    expect((await t.http.get('/api/v1/me/recent').set(user.auth)).body).toEqual([]);
  });

  it('비밀 문의는 작성자와 판매자만 내용을 본다. 답변은 판매자만', async () => {
    const seller = await createUser(t, 'SELLER');
    const asker = await createUser(t);
    const stranger = await createUser(t);
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const q = await t.http
      .post(`/api/v1/products/${p.id}/inquiries`)
      .set(asker.auth)
      .send({ question: '실물 사진 더 볼 수 있을까요?', isPrivate: true })
      .expect(201);
    const seen = await t.http.get(`/api/v1/products/${p.id}/inquiries`).set(stranger.auth).expect(200);
    expect(seen.body[0]).toMatchObject({ hidden: true, question: '비밀 문의입니다.' });
    await t.http
      .post(`/api/v1/inquiries/${q.body.id}/answer`)
      .set(stranger.auth)
      .send({ answer: '네' })
      .expect(404);
    await t.http
      .post(`/api/v1/inquiries/${q.body.id}/answer`)
      .set(seller.auth)
      .send({ answer: '네, 보내드릴게요.' })
      .expect(201);
    const mine = await t.http.get(`/api/v1/products/${p.id}/inquiries`).set(asker.auth).expect(200);
    expect(mine.body[0]).toMatchObject({ hidden: false, answer: '네, 보내드릴게요.', isMine: true });
    await t.http.delete(`/api/v1/inquiries/${q.body.id}`).set(asker.auth).expect(204);
  });

  it('판매자 공개 프로필과 판매 상품', async () => {
    const seller = await createUser(t, 'VERIFIED_SELLER');
    const { child } = await createCategory(t);
    await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'SOLD' });
    const profile = await t.http.get(`/api/v1/users/${seller.id}`).expect(200);
    expect(profile.body).toMatchObject({ verified: true, sellingCount: 1, soldCount: 1 });
    expect(JSON.stringify(profile.body)).not.toContain('@');
    const sold = await t.http.get(`/api/v1/users/${seller.id}/products?tab=sold`).expect(200);
    expect(sold.body).toHaveLength(1);
  });
});

describe('목록 개수·필터 선택지 캐시 (catalog-cache)', () => {
  it('마지막 페이지는 받은 건수로 개수를 정하고, 개수는 캐시하되 상품 노출이 바뀌면 바로 새로 센다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const first = await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    for (let i = 0; i < 2; i++) await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    const list = (limit: number) =>
      t.http.get(`/api/v1/products?category=${child.slug}&limit=${limit}`).expect(200);

    const page1 = await list(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.nextCursor).not.toBeNull();

    // API 를 거치지 않고 추가하면(세대가 그대로) 같은 조건의 개수는 캐시 값이다
    await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    expect((await list(2)).body.total).toBe(3);
    // 마지막 페이지는 개수를 세지 않고 받은 건수가 곧 전체 개수
    expect((await list(10)).body).toMatchObject({ total: 4, nextCursor: null });

    // 판매 중지는 세대를 올려 개수를 바로 다시 센다
    await t.http.post(`/api/v1/products/${first.id}/pause`).set(seller.auth).expect(204);
    const after = await list(2);
    expect(after.body.total).toBe(3);
    expect(after.body.items.map((i: { id: string }) => i.id)).not.toContain(first.id);
  });

  it('필터 선택지(facets)는 캐시하고, 상품 노출이 바뀌면 새로 집계한다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, price: 300_000 });
    const facets = () => t.http.get(`/api/v1/products/facets?category=${child.slug}`).expect(200);
    expect((await facets()).body.priceRange).toEqual({ min: 300_000, max: 300_000 });

    await createProduct(t, { sellerId: seller.id, categoryId: child.id, price: 500_000 });
    expect((await facets()).body.priceRange).toEqual({ min: 300_000, max: 300_000 });

    await t.http.post(`/api/v1/products/${p.id}/pause`).set(seller.auth).expect(204);
    expect((await facets()).body.priceRange).toEqual({ min: 500_000, max: 500_000 });
  });

  it('검색 후보도 세대별로 캐시하되, 목록은 공개 조건을 다시 확인한다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { child } = await createCategory(t);
    const word = `청자${Date.now().toString(36)}`;
    const p = await createProduct(t, { sellerId: seller.id, categoryId: child.id, title: `${word} 매병` });
    const search = () => t.http.get(`/api/v1/products?q=${encodeURIComponent(word)}`).expect(200);
    expect((await search()).body.items.map((i: { id: string }) => i.id)).toEqual([p.id]);
    // 캐시된 후보에 있어도 비공개가 되면 목록에서 빠진다 (세대를 올리지 않는 직접 변경)
    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'HIDDEN' } });
    expect((await search()).body.items).toEqual([]);
  });
});

describe('홈 (GET /home)', () => {
  it('캐시가 비었을 때 동시에 들어온 요청은 한 번만 만든다', async () => {
    const svc = t.app.get(ProductsService) as unknown as { buildHome: () => Promise<unknown> };
    const build = svc.buildHome.bind(svc);
    await t.redis.del(HOME_CACHE_KEY, `${HOME_CACHE_KEY}:stale`, `${HOME_CACHE_KEY}:lock`);
    // 만드는 데 시간이 걸리는 동안 나머지 요청이 도착하게 한다
    const spy = vi.spyOn(svc, 'buildHome').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return build();
    });
    try {
      const res = await Promise.all(Array.from({ length: 5 }, () => t.http.get('/api/v1/home').expect(200)));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(new Set(res.map((r) => JSON.stringify(r.body))).size).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('카테고리 트리 (GET /categories)', () => {
  it('소분류마다 공개 작품 수와 대표 이미지를, 대분류는 합계를 준다', async () => {
    const seller = await createUser(t, 'SELLER');
    const { parent, child } = await createCategory(t);
    await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await createProduct(t, { sellerId: seller.id, categoryId: child.id });
    await createProduct(t, { sellerId: seller.id, categoryId: child.id, status: 'DRAFT' }); // 비공개는 세지 않는다
    await t.redis.del(CATEGORY_CACHE_KEY);

    const res = await t.http.get('/api/v1/categories').expect(200);
    const root = res.body.find((c: { id: string }) => c.id === parent.id);
    const leaf = root.children.find((c: { id: string }) => c.id === child.id);
    expect(leaf.productCount).toBe(2);
    expect(leaf.coverImage).toMatchObject({ key: expect.stringMatching(/^img\/test\//), width: 800 });
    expect(root.productCount).toBe(2);
  });
});
