import type { Role, SaleType } from '@prisma/client';
import { signAccessToken } from '../src/common/auth';
import type { TestContext } from './app';

let seq = 0;
const uid = () =>
  `${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 기본은 필수 동의를 마친 회원. consent: false 면 소셜 첫 로그인처럼 동의 전 상태 */
export async function createUser(t: TestContext, role: Role = 'USER', opts: { consent?: boolean } = {}) {
  const id = uid();
  const agreedAt = opts.consent === false ? null : new Date();
  const user = await t.prisma.user.create({
    data: {
      email: `${id}@test.local`,
      role,
      emailVerifiedAt: new Date(),
      termsAgreedAt: agreedAt,
      privacyAgreedAt: agreedAt,
      ageConfirmedAt: agreedAt,
      profile: { create: { nickname: `u_${id}`.slice(0, 20) } },
    },
  });
  const token = await signAccessToken({ id: user.id, role, sessionId: 'test' });
  return { ...user, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createCategory(t: TestContext) {
  const id = uid();
  const parent = await t.prisma.category.create({
    data: { slug: `p-${id}`, name: `부모${id}`, group: 'ART' },
  });
  const child = await t.prisma.category.create({
    data: { slug: `c-${id}`, name: `자식${id}`, group: 'ART', parentId: parent.id },
  });
  return { parent, child };
}

/** 업로드를 거친 것처럼 이미지 소유 정보를 Redis 에 남긴다 */
export async function fakeUpload(t: TestContext, ownerId: string) {
  const key = `img/test/${uid()}`;
  await t.redis.set(`media:owner:${key}`, ownerId);
  await t.redis.set(
    `media:meta:${key}`,
    JSON.stringify({ key, width: 800, height: 600, dominantColor: '#aaaaaa' }),
  );
  return key;
}

export async function createProduct(
  t: TestContext,
  opts: {
    sellerId: string;
    categoryId: string;
    title?: string;
    price?: number;
    saleType?: SaleType;
    status?: 'ACTIVE' | 'DRAFT' | 'SOLD' | 'HIDDEN';
  },
) {
  const price = opts.price ?? 100_000;
  return t.prisma.product.create({
    data: {
      sellerId: opts.sellerId,
      categoryId: opts.categoryId,
      title: opts.title ?? `작품 ${uid()}`,
      saleType: opts.saleType ?? 'FIXED',
      price: BigInt(price),
      listPrice: BigInt(price),
      status: opts.status ?? 'ACTIVE',
      publishedAt: opts.status === 'DRAFT' ? null : new Date(),
      images: { create: { key: `img/test/${uid()}`, width: 800, height: 600 } },
    },
  });
}
