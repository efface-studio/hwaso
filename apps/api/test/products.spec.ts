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
