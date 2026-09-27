import type { Prisma } from '@prisma/client';
import {
  minNextBid,
  type AuctionSummary,
  type ImageDto,
  type ProductCardDto,
  type ProductDetailDto,
} from '@shop/shared';

/** 목록에서 공개해도 되는 상품 조건 */
export const PUBLIC_PRODUCT: Prisma.ProductWhereInput = {
  deletedAt: null,
  publishedAt: { not: null },
  status: { in: ['ACTIVE', 'RESERVED'] },
};

/** 상세·프로필에서는 판매 완료도 보여준다 */
export const VISIBLE_PRODUCT: Prisma.ProductWhereInput = {
  deletedAt: null,
  publishedAt: { not: null },
  status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] },
};

const imageSelect = { key: true, width: true, height: true, dominantColor: true } as const;
const auctionSummarySelect = {
  id: true,
  status: true,
  currentPrice: true,
  bidCount: true,
  startsAt: true,
  endsAt: true,
} as const;

export const cardInclude = {
  images: { select: imageSelect, orderBy: { sortOrder: 'asc' }, take: 1 },
  artist: { select: { name: true } },
  auction: { select: auctionSummarySelect },
} satisfies Prisma.ProductInclude;

export type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

export const detailInclude = {
  images: { select: imageSelect, orderBy: { sortOrder: 'asc' } },
  artist: { select: { id: true, name: true, nameEn: true, birthYear: true, deathYear: true } },
  auction: { select: auctionSummarySelect },
  category: { select: { id: true, slug: true, name: true, parent: { select: { slug: true, name: true } } } },
  certificate: true,
  provenance: { orderBy: { sortOrder: 'asc' } },
  seller: {
    select: {
      id: true,
      role: true,
      profile: {
        select: { nickname: true, avatarKey: true, ratingAvg: true, ratingCount: true, tradeCount: true },
      },
    },
  },
} satisfies Prisma.ProductInclude;

export type DetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

const num = (v: bigint | null | undefined) => (v == null ? null : Number(v));

function toImage(
  i: { key: string; width: number; height: number; dominantColor: string } | undefined,
): ImageDto | null {
  return i ? { key: i.key, width: i.width, height: i.height, dominantColor: i.dominantColor } : null;
}

function toAuctionSummary(a: CardRow['auction']): AuctionSummary | null {
  if (!a) return null;
  return {
    id: a.id,
    status: a.status,
    currentPrice: Number(a.currentPrice),
    bidCount: a.bidCount,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
  };
}

export function toCard(p: CardRow, favorites?: Set<string>): ProductCardDto {
  return {
    id: p.id,
    title: p.title,
    artistName: p.artist?.name ?? p.maker ?? null,
    image: toImage(p.images[0]),
    saleType: p.saleType,
    status: p.status,
    price: num(p.price),
    auction: toAuctionSummary(p.auction),
    favoriteCount: p.favoriteCount,
    isFavorite: favorites?.has(p.id) ?? false,
  };
}

export function toDetail(p: DetailRow, viewerId: string | undefined, isFavorite: boolean): ProductDetailDto {
  const card = toCard(
    { ...p, images: p.images.slice(0, 1) } as CardRow,
    isFavorite ? new Set([p.id]) : undefined,
  );
  const path = [
    ...(p.category.parent ? [{ slug: p.category.parent.slug, name: p.category.parent.name }] : []),
    { slug: p.category.slug, name: p.category.name },
  ];
  const cert = p.certificate;
  return {
    ...card,
    description: p.description,
    images: p.images.map((i) => toImage(i)!),
    category: { id: p.category.id, slug: p.category.slug, name: p.category.name, path },
    artist: p.artist,
    maker: p.maker,
    brand: p.brand,
    era: p.era,
    productionYear: p.productionYear,
    material: p.material,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
    depthCm: p.depthCm,
    condition: p.condition,
    conditionNote: p.conditionNote,
    region: p.region,
    stock: p.stock,
    availableAt: p.availableAt?.toISOString() ?? null,
    shippingFee: Number(p.shippingFee),
    shippingMethod: p.shippingMethod,
    returnPolicy: p.returnPolicy,
    viewCount: p.viewCount,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    verificationStatus: p.verificationStatus,
    // 검수 반려된 인증서는 공개하지 않는다 (docs/DESIGN_SYSTEM.md §9)
    certificate:
      cert && cert.verificationStatus !== 'REJECTED'
        ? {
            issuer: cert.issuer,
            number: cert.number,
            issuedAt: cert.issuedAt?.toISOString().slice(0, 10) ?? null,
            imageKey: cert.imageKey,
            authenticityNote: cert.authenticityNote,
            verificationStatus: cert.verificationStatus,
            reviewedAt: cert.reviewedAt?.toISOString() ?? null,
          }
        : null,
    provenance: p.provenance.map((v) => ({
      id: v.id,
      kind: v.kind,
      period: v.period,
      title: v.title,
      description: v.description,
    })),
    seller: {
      id: p.seller.id,
      nickname: p.seller.profile?.nickname ?? '알 수 없음',
      avatarKey: p.seller.profile?.avatarKey ?? null,
      ratingAvg: Math.round((p.seller.profile?.ratingAvg ?? 0) * 10) / 10,
      ratingCount: p.seller.profile?.ratingCount ?? 0,
      tradeCount: p.seller.profile?.tradeCount ?? 0,
      verified: p.seller.role === 'VERIFIED_SELLER',
    },
    isMine: viewerId === p.sellerId,
  };
}

export { minNextBid };
