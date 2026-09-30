import type { Role, SaleType } from '@prisma/client';
import { REAUTH_HEADER } from '@shop/shared';
import { signAccessToken, signReauthToken, verifyAccessToken } from '../src/common/auth';
import type { TestContext } from './app';

let seq = 0;
const uid = () =>
  `${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export async function createUser(t: TestContext, role: Role = 'USER') {
  const id = uid();
  const user = await t.prisma.user.create({
    data: {
      email: `${id}@test.local`,
      role,
      emailVerifiedAt: new Date(),
      profile: { create: { nickname: `u_${id}`.slice(0, 20) } },
    },
  });
  // 실제 로그인처럼 기기 세션(앱)을 만든다 — 재인증·세션 폐기 검사가 세션 행을 본다
  const session = await t.prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: `test-${id}`,
      familyId: `fam-${id}`,
      deviceName: 'Test iPhone',
      platform: 'ios',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const token = await signAccessToken({
    id: user.id,
    role,
    sessionId: session.id,
    familyId: session.familyId,
  });
  return { ...user, token, sessionId: session.id, auth: { Authorization: `Bearer ${token}` } };
}

/**
 * 민감 작업용 재인증 헤더. 재인증 흐름 자체는 security.spec 에서 검증하고, 다른 테스트는 이 헬퍼로 바로 발급한다.
 * user 는 createUser 결과 또는 access 토큰 문자열(가입·로그인 응답).
 */
export async function reauth(t: TestContext, user: { token: string } | string) {
  const claims = await verifyAccessToken(typeof user === 'string' ? user : user.token);
  if (!claims) throw new Error('invalid access token');
  const session = await t.prisma.session.findUniqueOrThrow({ where: { id: claims.sessionId } });
  const { reauthToken } = await signReauthToken({
    userId: claims.id,
    sessionId: session.id,
    familyId: session.familyId,
  });
  return { [REAUTH_HEADER]: reauthToken };
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
