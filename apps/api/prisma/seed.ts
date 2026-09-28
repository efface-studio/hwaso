/**
 * 개발용 시드. 기존 데이터를 비우고 카테고리·정책·계정·예시 게시물을 채운다.
 *
 * 예시 게시물 원천: The Cleveland Museum of Art Open Access (CC0) — seed/samples.json
 * 가격·판매 방식·경매 상태·인증서 검수 상태 등 거래 정보는 기능 시연을 위한 가상 데이터다.
 *
 * 개발 계정 (운영에서는 실행 불가):
 *   최고 관리자: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (apps/api/.env, 없으면 SEED_PASSWORD)
 *   seller1~5@shop.local (판매자)   buyer1~4@shop.local (구매자) — 비밀번호 SEED_PASSWORD (기본값 아래)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  type AuctionStatus,
  type ItemCondition,
  Prisma,
  PrismaClient,
  type ProductStatus,
  type SaleType,
  type VerificationStatus,
} from '@prisma/client';
import argon2 from 'argon2';
import { processImage } from '../src/media/image';
import { createS3Client, ORIGINAL_PREFIX, PUBLIC_PREFIX } from '../src/storage/s3.service';
import { CATEGORY_TREE } from './seed/categories';

const prisma = new PrismaClient();
const s3 = createS3Client();
const BUCKET = process.env.S3_BUCKET ?? 'shop-media';
const PASSWORD = process.env.SEED_PASSWORD ?? 'shop1234!';
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@shop.local').toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || PASSWORD;
const SEED_DIR = resolve(import.meta.dirname, 'seed');
const CACHE_DIR = resolve(SEED_DIR, '.cache');

interface Sample {
  category: string;
  source: string;
  sourceUrl: string;
  accession: string;
  title: string;
  artist: string | null;
  artistBirthYear: number | null;
  artistDeathYear: number | null;
  culture: string | null;
  date: string | null;
  year: number | null;
  technique: string | null;
  measurements: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  description: string | null;
  provenance: { date: string | null; description: string }[];
  exhibitions: string[];
  citations: string[];
  image: { url: string; width: number; height: number };
}
type Ko = Record<string, { title: string; artist: string | null; era: string; material: string }>;

const samples = JSON.parse(readFileSync(resolve(SEED_DIR, 'samples.json'), 'utf8')) as Sample[];
const ko = JSON.parse(readFileSync(resolve(SEED_DIR, 'samples.ko.json'), 'utf8')) as Ko;

/** 재실행해도 같은 값이 나오도록 accession 기반 결정적 난수 */
function rand(seed: string, salt = ''): number {
  return (
    createHash('sha256')
      .update(seed + salt)
      .digest()
      .readUInt32BE(0) / 0xffffffff
  );
}
const pick = <T>(seed: string, arr: readonly T[], salt = '') =>
  arr[Math.floor(rand(seed, salt) * arr.length)]!;

const PRICE_RANGE: Record<string, [number, number]> = {
  painting: [3_000_000, 85_000_000],
  drawing: [800_000, 12_000_000],
  print: [300_000, 8_000_000],
  sculpture: [2_000_000, 60_000_000],
  photography: [500_000, 6_000_000],
  contemporary: [5_000_000, 120_000_000],
  'old-art': [2_000_000, 40_000_000],
  craft: [1_500_000, 30_000_000],
  artifact: [1_000_000, 20_000_000],
  antique: [400_000, 15_000_000],
  vintage: [300_000, 9_000_000],
  document: [800_000, 10_000_000],
  book: [2_000_000, 50_000_000],
  poster: [200_000, 3_000_000],
  stamp: [150_000, 2_000_000],
  medal: [100_000, 1_500_000],
  currency: [80_000, 5_000_000],
  'daily-object': [50_000, 1_200_000],
  collectible: [300_000, 4_000_000],
  limited: [500_000, 12_000_000],
  etc: [200_000, 6_000_000],
};

function priceFor(s: Sample): number {
  const [min, max] = PRICE_RANGE[s.category] ?? [100_000, 1_000_000];
  const raw = min + (max - min) * rand(s.accession, 'price') ** 2;
  const unit = raw >= 10_000_000 ? 1_000_000 : raw >= 1_000_000 ? 100_000 : 10_000;
  return Math.round(raw / unit) * unit;
}

function incrementFor(price: number): number {
  if (price < 100_000) return 1_000;
  if (price < 1_000_000) return 10_000;
  if (price < 10_000_000) return 50_000;
  if (price < 100_000_000) return 100_000;
  return 500_000;
}

const CONDITIONS: ItemCondition[] = ['MINT', 'EXCELLENT', 'EXCELLENT', 'GOOD', 'GOOD', 'GOOD', 'FAIR'];
const REGIONS = [
  '서울 종로구',
  '서울 강남구',
  '서울 용산구',
  '부산 해운대구',
  '대구 중구',
  '경기 성남시',
  '인천 연수구',
  '광주 동구',
];
const CONDITION_NOTE: Record<ItemCondition, string> = {
  MINT: '사용감이 거의 없고 보존 상태가 매우 좋습니다.',
  EXCELLENT: '세월에 따른 미세한 변화 외에 눈에 띄는 손상은 없습니다.',
  GOOD: '가장자리에 경미한 마모가 있으나 감상에 지장은 없습니다.',
  FAIR: '부분적인 변색과 미세한 균열이 있습니다. 상세 사진을 확인해주세요.',
  POOR: '복원이 필요한 손상이 있습니다.',
};

// ───────────────────────── helpers ─────────────────────────

async function loadImage(s: Sample): Promise<Buffer> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = resolve(CACHE_DIR, `${s.accession.replace(/[^\w.-]/g, '_')}.jpg`);
  if (existsSync(file)) return readFileSync(file);
  for (let i = 0; i < 3; i++) {
    const res = await fetch(s.image.url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      return buf;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error(`이미지 다운로드 실패: ${s.image.url}`);
}

/**
 * 오프라인 시드(SEED_OFFLINE=1): 이미지 다운로드·S3 업로드 없이 고정 키를 쓴다 (CI E2E 용 — 사진은 보이지 않는다)
 */
const OFFLINE = process.env.SEED_OFFLINE === '1';
const offlineImage = (s: Sample) => ({
  key: `seed/${s.accession.replace(/[^\w.-]/g, '_')}`,
  width: 800,
  height: 1000,
  dominantColor: '#D9D4CC',
});

async function uploadImage(buffer: Buffer) {
  const img = await processImage(buffer);
  await Promise.all([
    s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${ORIGINAL_PREFIX}${img.key}.${img.originalFormat}`,
        Body: buffer,
        ContentType: 'application/octet-stream',
      }),
    ),
    ...img.variants.map((v) =>
      s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: `${PUBLIC_PREFIX}${v.path}`,
          Body: v.body,
          ContentType: v.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      ),
    ),
  ]);
  return img;
}

function describe(s: Sample, k: Ko[string]): string {
  const lines = [
    `${k.era}에 제작된 ${k.material} 작품입니다.`,
    s.measurements ? `크기: ${s.measurements}` : null,
    '',
    s.description ? `작품 해설 (원문)\n${s.description}` : null,
    '',
    '※ 이 게시물은 서비스 기능 시연을 위한 예시입니다. 거래 정보(가격·판매 방식·상태)는 가상이며,',
    `이미지와 작품 정보의 출처는 ${s.source} 입니다. (${s.sourceUrl})`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

// ───────────────────────── seed steps ─────────────────────────

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRaw`${Prisma.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)}`;
}

async function seedCategories() {
  const ids = new Map<string, string>();
  for (const [gi, g] of CATEGORY_TREE.entries()) {
    const parent = await prisma.category.create({
      data: { slug: g.slug, name: g.name, group: g.group, sortOrder: gi },
    });
    ids.set(g.slug, parent.id);
    for (const [ci, [slug, name]] of g.children.entries()) {
      const c = await prisma.category.create({
        data: { slug, name, group: g.group, parentId: parent.id, sortOrder: ci },
      });
      ids.set(slug, c.id);
    }
  }
  return ids;
}

const SELLERS = [
  {
    nickname: '서촌갤러리',
    bio: '서촌에서 20년째 근현대 회화와 판화를 소개합니다.',
    region: '서울 종로구',
    verified: true,
  },
  {
    nickname: '인사동고미술',
    bio: '조선·고려 도자와 고서화를 다룹니다. 실물 확인 방문 환영.',
    region: '서울 종로구',
    verified: true,
  },
  {
    nickname: '빈티지아카이브',
    bio: '아르데코와 빈티지 오브제를 모읍니다.',
    region: '서울 용산구',
    verified: false,
  },
  {
    nickname: '페이퍼앤프린트',
    bio: '포스터, 고문서, 희귀 서적 전문.',
    region: '부산 해운대구',
    verified: false,
  },
  { nickname: '코인앤메달', bio: '세계 주화와 기념 메달 컬렉터.', region: '대구 중구', verified: true },
];
const BUYERS = ['아트러버', '수집하는사람', '주말컬렉터', '미술관옆집'];

const SELLER_BY_CATEGORY: Record<string, number> = {
  painting: 0,
  drawing: 0,
  print: 0,
  contemporary: 0,
  photography: 0,
  sculpture: 0,
  'old-art': 1,
  craft: 1,
  artifact: 1,
  antique: 1,
  'daily-object': 1,
  vintage: 2,
  collectible: 2,
  limited: 2,
  etc: 2,
  document: 3,
  book: 3,
  poster: 3,
  stamp: 3,
  medal: 4,
  currency: 4,
};

async function seedUsers() {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const now = new Date();
  const mk = (
    email: string,
    nickname: string,
    role: 'USER' | 'SELLER' | 'VERIFIED_SELLER' | 'SUPER_ADMIN',
    extra: { bio?: string; region?: string; passwordHash?: string } = {},
  ) =>
    prisma.user.create({
      data: {
        email,
        passwordHash: extra.passwordHash ?? passwordHash,
        emailVerifiedAt: now,
        role,
        profile: { create: { nickname, bio: extra.bio ?? '', region: extra.region ?? null } },
      },
    });

  await mk(ADMIN_EMAIL, '운영팀', 'SUPER_ADMIN', {
    passwordHash: await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id }),
  });
  const sellers = [];
  for (const [i, s] of SELLERS.entries()) {
    const u = await mk(`seller${i + 1}@shop.local`, s.nickname, s.verified ? 'VERIFIED_SELLER' : 'SELLER', s);
    await prisma.seller.create({
      data: {
        userId: u.id,
        businessName: s.nickname,
        bankName: '예시은행',
        bankAccountMasked: '****-**-1234',
        bankAccountEnc: 'seed-placeholder',
        accountHolder: s.nickname,
        verifiedAt: s.verified ? now : null,
      },
    });
    sellers.push(u);
  }
  const buyers = [];
  for (const [i, n] of BUYERS.entries()) buyers.push(await mk(`buyer${i + 1}@shop.local`, n, 'USER'));
  return { sellers, buyers };
}

const REVIEWS: [number, string][] = [
  [5, '사진보다 실물이 더 좋아요. 포장도 정말 꼼꼼했습니다.'],
  [5, '문의에 빠르게 답해주셨고 액자까지 안전하게 도착했어요.'],
  [4, '상태 설명이 정확했어요. 배송이 하루 늦었지만 만족합니다.'],
  [5, '감정서와 소장 이력까지 챙겨주셔서 믿고 구매했습니다.'],
  [4, '좋은 작품 잘 받았습니다. 다음에도 거래하고 싶어요.'],
];

/**
 * 거래 기록: 판매 완료 작품마다 구매 확정 주문·정산·상호 후기를 만들고,
 * 프로필 평점·거래 수는 실제 기록으로 계산한다. 구매자는 판매자 두 명을 팔로우한다.
 */
async function seedTrades(sellers: { id: string }[], buyers: { id: string }[]) {
  const sold = await prisma.product.findMany({
    where: { status: 'SOLD', saleType: { not: 'AUCTION' } },
    include: { images: { take: 1 } },
  });
  for (const [i, p] of sold.entries()) {
    const buyer = buyers[i % buyers.length]!;
    const price = p.price ?? 100_000n;
    const done = new Date(Date.now() - (10 + i * 3) * 86_400_000);
    const order = await prisma.order.create({
      data: {
        orderNumber: `SEED-${String(i + 1).padStart(4, '0')}`,
        buyerId: buyer.id,
        sellerId: p.sellerId,
        source: 'DIRECT',
        status: 'COMPLETED',
        itemsAmount: price,
        shippingFee: p.shippingFee,
        totalAmount: price + p.shippingFee,
        paidAt: done,
        deliveredAt: done,
        completedAt: done,
        createdAt: done,
        shippingAddress: {
          recipient: '구매자',
          phone: '01000000000',
          zipCode: '03161',
          address1: '서울 종로구 인사동길 12',
          address2: '',
          memo: '',
        },
        items: {
          create: {
            productId: p.id,
            titleSnapshot: p.title,
            imageKeySnapshot: p.images[0]?.key,
            unitPrice: price,
            quantity: 1,
          },
        },
        statusLogs: { create: { from: 'DELIVERED', to: 'COMPLETED', reason: '구매 확정', createdAt: done } },
      },
    });
    const fee = BigInt(Math.round(Number(price) * 0.08));
    await prisma.settlement.create({
      data: {
        sellerId: p.sellerId,
        orderId: order.id,
        grossAmount: price + p.shippingFee,
        feeAmount: fee,
        netAmount: price + p.shippingFee - fee,
        status: i % 2 ? 'PAID' : 'SCHEDULED',
        scheduledAt: new Date(done.getTime() + 2 * 86_400_000),
        paidAt: i % 2 ? new Date(done.getTime() + 2 * 86_400_000) : null,
      },
    });
    const [rating, comment] = REVIEWS[i % REVIEWS.length]!;
    await prisma.review.create({
      data: {
        orderId: order.id,
        authorId: buyer.id,
        targetUserId: p.sellerId,
        direction: 'BUYER_TO_SELLER',
        rating,
        comment,
        createdAt: done,
      },
    });
    if (i % 2 === 0)
      await prisma.review.create({
        data: {
          orderId: order.id,
          authorId: p.sellerId,
          targetUserId: buyer.id,
          direction: 'SELLER_TO_BUYER',
          rating: 5,
          comment: '빠른 결제와 친절한 응대 감사합니다.',
          createdAt: done,
        },
      });
  }
  for (const u of [...sellers, ...buyers]) {
    const [agg, trades] = await Promise.all([
      prisma.review.aggregate({
        where: { targetUserId: u.id, deletedAt: null },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.order.count({ where: { status: 'COMPLETED', OR: [{ buyerId: u.id }, { sellerId: u.id }] } }),
    ]);
    await prisma.profile.update({
      where: { userId: u.id },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count, tradeCount: trades },
    });
  }
  for (const [i, b] of buyers.entries())
    await prisma.follow.createMany({
      data: [sellers[i % sellers.length]!, sellers[(i + 1) % sellers.length]!].map((s) => ({
        followerId: b.id,
        followingId: s.id,
      })),
      skipDuplicates: true,
    });
}

type Plan = { saleType: SaleType; status: ProductStatus; auction?: AuctionPlan };
type AuctionPlan = {
  status: AuctionStatus;
  startOffsetMin: number;
  endOffsetMin: number;
  bids: number;
  buyNow: boolean;
  autoExtend: boolean;
};

/** 판매 방식·경매 상태를 골고루 분배한다 (기능 시연용) */
function planFor(i: number): Plan {
  const auctionPlans: AuctionPlan[] = [
    { status: 'LIVE', startOffsetMin: -120, endOffsetMin: 6, bids: 7, buyNow: false, autoExtend: true },
    { status: 'LIVE', startOffsetMin: -600, endOffsetMin: 25, bids: 12, buyNow: true, autoExtend: true },
    { status: 'LIVE', startOffsetMin: -60, endOffsetMin: 180, bids: 3, buyNow: true, autoExtend: true },
    {
      status: 'LIVE',
      startOffsetMin: -1440,
      endOffsetMin: 60 * 26,
      bids: 5,
      buyNow: false,
      autoExtend: false,
    },
    { status: 'LIVE', startOffsetMin: -30, endOffsetMin: 60 * 72, bids: 0, buyNow: true, autoExtend: true },
    {
      status: 'SCHEDULED',
      startOffsetMin: 90,
      endOffsetMin: 90 + 60 * 24,
      bids: 0,
      buyNow: true,
      autoExtend: true,
    },
    {
      status: 'SCHEDULED',
      startOffsetMin: 60 * 20,
      endOffsetMin: 60 * 20 + 60 * 48,
      bids: 0,
      buyNow: false,
      autoExtend: true,
    },
    {
      status: 'ENDED',
      startOffsetMin: -60 * 72,
      endOffsetMin: -60 * 2,
      bids: 9,
      buyNow: false,
      autoExtend: true,
    },
    {
      status: 'ENDED',
      startOffsetMin: -60 * 48,
      endOffsetMin: -60 * 5,
      bids: 0,
      buyNow: false,
      autoExtend: true,
    },
  ];
  if (i % 8 === 7) return { saleType: 'RESERVATION', status: 'ACTIVE' };
  if (i % 8 === 2 || i % 8 === 5 || i % 8 === 0) {
    const a = auctionPlans[Math.floor(i / 3) % auctionPlans.length]!;
    const status: ProductStatus = a.status === 'ENDED' ? (a.bids > 0 ? 'RESERVED' : 'ACTIVE') : 'ACTIVE';
    return { saleType: 'AUCTION', status, auction: a };
  }
  if (i % 17 === 4) return { saleType: 'FIXED', status: 'SOLD' };
  return { saleType: 'FIXED', status: 'ACTIVE' };
}

async function seedAuction(
  productId: string,
  sellerId: string,
  price: number,
  plan: AuctionPlan,
  buyers: { id: string }[],
  policy: { extensionWindowSec: number; extensionSec: number; maxExtensionSec: number },
  seed: string,
) {
  const now = Date.now();
  const startPrice = Math.max(1_000, Math.round((price * 0.6) / incrementFor(price)) * incrementFor(price));
  const inc = incrementFor(startPrice);
  const startsAt = new Date(now + plan.startOffsetMin * 60_000);
  const endsAt = new Date(now + plan.endOffsetMin * 60_000);
  const buyNowPrice = plan.buyNow ? Math.round((price * 1.3) / inc) * inc : null;

  const auction = await prisma.auction.create({
    data: {
      productId,
      sellerId,
      status: plan.status,
      startPrice: BigInt(startPrice),
      bidIncrement: BigInt(inc),
      buyNowPrice: buyNowPrice ? BigInt(buyNowPrice) : null,
      currentPrice: BigInt(startPrice),
      startsAt,
      endsAt,
      originalEndsAt: endsAt,
      maxEndsAt: new Date(endsAt.getTime() + policy.maxExtensionSec * 1000),
      autoExtend: plan.autoExtend,
      extensionWindowSec: policy.extensionWindowSec,
      extensionSec: policy.extensionSec,
      description: plan.autoExtend ? '종료 30초 이내 입찰 시 30초 자동 연장됩니다.' : '',
    },
  });

  // 입찰 기록: 규칙(최소가·호가 단위)에 맞게 시간 순으로 증가
  let current = startPrice;
  let last: { id: string; bidderId: string } | null = null;
  const bidders = new Set<string>();
  const span = Math.min(endsAt.getTime(), now) - startsAt.getTime();
  for (let b = 0; b < plan.bids; b++) {
    const steps = 1 + Math.floor(rand(seed, `step${b}`) * 3);
    const amount = b === 0 ? startPrice : current + inc * steps;
    // 직전 최고 입찰자와 다른 사람이 입찰한다
    const candidates = buyers.filter((u) => u.id !== last?.bidderId);
    const bidder = pick(seed, candidates, `bidder${b}`);
    const bid = await prisma.auctionBid.create({
      data: {
        auctionId: auction.id,
        bidderId: bidder.id,
        amount: BigInt(amount),
        idempotencyKey: `seed-${auction.id}-${b}`,
        createdAt: new Date(startsAt.getTime() + (span * (b + 1)) / (plan.bids + 1)),
      },
    });
    current = amount;
    last = { id: bid.id, bidderId: bidder.id };
    bidders.add(bidder.id);
  }

  const ended = plan.status === 'ENDED';
  await prisma.auction.update({
    where: { id: auction.id },
    data: {
      currentPrice: BigInt(current),
      highestBidId: last?.id ?? null,
      highestBidderId: last?.bidderId ?? null,
      bidCount: plan.bids,
      bidderCount: bidders.size,
      version: plan.bids,
      result: ended ? (last ? 'SOLD' : 'NO_BIDS') : 'NONE',
      winnerId: ended ? (last?.bidderId ?? null) : null,
      endedAt: ended ? endsAt : null,
    },
  });
  await prisma.product.update({ where: { id: productId }, data: { listPrice: BigInt(current) } });
}

function certificateFor(s: Sample, i: number): Prisma.CertificateCreateWithoutProductInput | undefined {
  if (i % 3 === 1) return undefined;
  const status: VerificationStatus = (['VERIFIED', 'PENDING', 'UNVERIFIED'] as const)[
    i % 3 === 0 ? 0 : i % 2 === 0 ? 1 : 2
  ];
  return {
    issuer: '예시 감정기관 (가상)',
    number: `EX-${s.accession.replace(/\./g, '')}`,
    issuedAt: new Date(Date.UTC(2024, (i * 5) % 12, 1 + (i % 27))),
    authenticityNote: '판매자가 제출한 감정서 정보입니다.',
    verificationStatus: status,
    reviewedAt: status === 'VERIFIED' ? new Date() : null,
    reviewNote: status === 'VERIFIED' ? '감정서 원본과 실물 대조 완료 (시연용)' : null,
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('운영 환경에서는 시드를 실행할 수 없습니다.');

  console.log('· 기존 데이터 삭제');
  await wipe();
  const policy = await prisma.auctionPolicy.create({ data: { id: 'default' } });
  const categoryIds = await seedCategories();
  const { sellers, buyers } = await seedUsers();
  console.log(`· 카테고리 ${categoryIds.size}개, 판매자 ${sellers.length}명, 구매자 ${buyers.length}명`);

  const artistIds = new Map<string, string>();
  const productIds: string[] = [];

  for (const [i, s] of samples.entries()) {
    const k = ko[s.accession]!;
    let artistId: string | null = null;
    if (s.artist && k.artist) {
      artistId = artistIds.get(s.artist) ?? null;
      if (!artistId) {
        const a = await prisma.artist.create({
          data: {
            name: k.artist,
            nameEn: s.artist,
            birthYear: s.artistBirthYear,
            deathYear: s.artistDeathYear,
          },
        });
        artistId = a.id;
        artistIds.set(s.artist, a.id);
      }
    }

    const img = OFFLINE ? offlineImage(s) : await uploadImage(await loadImage(s));
    const price = priceFor(s);
    const plan = planFor(i);
    const seller = sellers[SELLER_BY_CATEGORY[s.category] ?? 0]!;
    const condition = pick(s.accession, CONDITIONS, 'cond');
    const cert = certificateFor(s, i);
    const publishedAt = new Date(Date.now() - Math.floor(rand(s.accession, 'pub') * 30 * 86_400_000));

    const provenance: Prisma.ProvenanceCreateWithoutProductInput[] = [
      ...s.provenance.map((p, idx) => ({
        kind: 'OWNERSHIP' as const,
        period: p.date ?? '연도 미상',
        title: p.description.slice(0, 180),
        description: '',
        sortOrder: idx,
      })),
      ...s.exhibitions.map((e, idx) => ({
        kind: 'EXHIBITION' as const,
        period: '',
        title: e.slice(0, 180),
        description: '',
        sortOrder: 100 + idx,
      })),
      ...s.citations.map((c, idx) => ({
        kind: 'PUBLICATION' as const,
        period: '',
        title: c.slice(0, 180),
        description: '',
        sortOrder: 200 + idx,
      })),
    ];

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: categoryIds.get(s.category)!,
        artistId,
        title: k.title,
        description: describe(s, k),
        era: k.era,
        productionYear: s.year,
        material: k.material,
        widthCm: s.widthCm,
        heightCm: s.heightCm,
        depthCm: s.depthCm,
        condition,
        conditionNote: CONDITION_NOTE[condition],
        region: pick(s.accession, REGIONS, 'region'),
        saleType: plan.saleType,
        status: plan.status,
        price: plan.saleType === 'AUCTION' ? null : BigInt(price),
        listPrice: plan.saleType === 'AUCTION' ? null : BigInt(price),
        shippingFee: BigInt(price >= 1_000_000 ? 0 : 5_000),
        shippingMethod: price >= 3_000_000 ? '미술품 전문 운송 (무료)' : '택배 (파손 방지 포장)',
        returnPolicy:
          '작품 특성상 단순 변심에 의한 반품은 어렵습니다. 상품 설명과 현저히 다른 경우 수령 후 7일 이내 반품 가능합니다.',
        availableAt:
          plan.saleType === 'RESERVATION' ? new Date(Date.now() + (3 + (i % 10)) * 86_400_000) : null,
        viewCount: Math.floor(rand(s.accession, 'views') * 3000),
        verificationStatus: cert?.verificationStatus ?? 'UNVERIFIED',
        publishedAt,
        createdAt: publishedAt,
        images: {
          create: {
            key: img.key,
            width: img.width,
            height: img.height,
            dominantColor: img.dominantColor,
            sortOrder: 0,
          },
        },
        certificate: cert ? { create: cert } : undefined,
        provenance: { create: provenance },
      },
    });
    productIds.push(product.id);

    if (plan.auction) {
      await seedAuction(product.id, seller.id, price, plan.auction, buyers, policy, s.accession);
    }
    console.log(
      `· [${String(i + 1).padStart(2)}/${samples.length}] ${s.category.padEnd(12)} ${plan.saleType.padEnd(11)} ${k.title}`,
    );
  }

  // 관심상품 · 최근 본 상품 · 팔로우 · 문의
  for (const [bi, buyer] of buyers.entries()) {
    const favs = productIds.filter((_, idx) => rand(`${buyer.id}`, `fav${idx}`) < 0.18 || idx % 9 === bi);
    await prisma.favorite.createMany({
      data: favs.map((productId) => ({ userId: buyer.id, productId })),
      skipDuplicates: true,
    });
    await prisma.recentView.createMany({
      data: productIds.slice(bi * 5, bi * 5 + 8).map((productId, idx) => ({
        userId: buyer.id,
        productId,
        viewedAt: new Date(Date.now() - idx * 3_600_000),
      })),
    });
    await prisma.follow.createMany({
      data: sellers
        .filter((_, si) => (si + bi) % 2 === 0)
        .map((s) => ({ followerId: buyer.id, followingId: s.id })),
    });
  }
  const favCounts = await prisma.favorite.groupBy({ by: ['productId'], _count: true });
  for (const f of favCounts) {
    await prisma.product.update({
      where: { id: f.productId },
      data: { favoriteCount: f._count + Math.floor(rand(f.productId) * 40) },
    });
  }

  const questions = [
    [
      '실물 색감이 사진과 비슷한가요?',
      '네, 자연광에서 촬영했고 실물과 거의 같습니다. 추가 사진이 필요하시면 채팅 주세요.',
    ],
    ['액자 포함인가요?', '현재 액자는 포함되어 있지 않습니다. 원하시면 전문 액자 업체를 안내해드립니다.'],
    ['직거래 가능한가요?', null],
    ['감정서 원본도 함께 보내주시나요?', '네, 감정서 원본을 작품과 함께 발송합니다.'],
  ] as const;
  for (const [idx, productId] of productIds.entries()) {
    if (idx % 4 !== 1) continue;
    const [q, a] = questions[idx % questions.length]!;
    await prisma.inquiry.create({
      data: {
        productId,
        userId: buyers[idx % buyers.length]!.id,
        question: q,
        answer: a,
        answeredAt: a ? new Date() : null,
        createdAt: new Date(Date.now() - 86_400_000),
      },
    });
  }

  await prisma.notice.createMany({
    data: [
      {
        title: '화소(畫所) 오픈 안내',
        body: '작품과 사람이 만나는 곳, 화소가 문을 엽니다. 미술품·고미술·컬렉터블 거래와 실시간 경매를 만나보세요.',
        isPinned: true,
      },
      {
        title: '경매 연장 정책 안내',
        body: '종료 30초 이내 입찰이 있으면 종료 시간이 30초 연장됩니다. (최대 30분)',
      },
      {
        title: '인증서·출처 정보 표기 기준',
        body: '‘플랫폼 검수 완료’ 표시는 운영팀이 감정서 원본과 실물을 대조한 항목에만 붙습니다.',
      },
    ],
  });

  await seedTrades(sellers, buyers);

  // 홈 상단 배너 (예시 작품 이미지 재사용). 운영 중에는 관리자 화면에서 관리한다
  const imageOf = async (title: string) =>
    (await prisma.productImage.findFirst({ where: { product: { title } }, select: { key: true } }))?.key;
  const bannerPlan = [
    {
      title: '툴루즈 로트레크, 파리의 밤',
      subtitle: '19세기 몽마르트르를 담은 석판화 포스터',
      image: '메이 밀턴',
      link: '/category/poster',
    },
    {
      title: '조선의 백자',
      subtitle: '담백한 선과 여백 — 조선 도자 컬렉션',
      image: '백자 항아리',
      link: '/category/antique',
    },
    {
      title: '지금 진행 중인 경매',
      subtitle: '마감 30초 전 입찰이 있으면 자동으로 연장돼요',
      image: '빨강, 노랑, 파랑의 구성',
      link: '/auctions',
    },
  ];
  for (const [i, b] of bannerPlan.entries()) {
    const key = await imageOf(b.image);
    if (!key) continue;
    await prisma.banner.create({
      data: {
        title: b.title,
        subtitle: b.subtitle,
        imageKey: key,
        link: b.link,
        sortOrder: i,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 90 * 86_400_000),
      },
    });
  }

  console.log(`✔ 완료: 게시물 ${productIds.length}개, 작가 ${artistIds.size}명`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
