import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ArtistDto,
  FacetsDto,
  HomeDto,
  InquiryDto,
  ProductDetailDto,
  ProductListQuery,
  ProductListResponse,
  SuggestDto,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  cardInclude,
  detailInclude,
  PUBLIC_PRODUCT,
  toCard,
  toDetail,
  VISIBLE_PRODUCT,
} from './product.mapper';

/** ponytail: 관련도 정렬은 일치 후보 최대 500건을 앱에서 점수화 — 카탈로그가 커지면 OpenSearch 로 전환 (docs/ARCHITECTURE.md §7) */
const RELEVANCE_CANDIDATES = 500;
const RECENT_VIEWS_KEEP = 50;

export const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url');
export function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, 'base64url').toString());
  return Number.isSafeInteger(n) && n >= 0 && n < 100_000 ? n : 0;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async favoriteSet(userId: string | undefined, productIds: string[]): Promise<Set<string>> {
    if (!userId || productIds.length === 0) return new Set();
    const rows = await this.prisma.favorite.findMany({
      where: { userId, productId: { in: productIds } },
      select: { productId: true },
    });
    return new Set(rows.map((r) => r.productId));
  }

  private async categoryIds(slug: string): Promise<string[]> {
    const c = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true, children: { select: { id: true } } },
    });
    if (!c) throw new AppException('NOT_FOUND', '카테고리를 찾을 수 없습니다.');
    return [c.id, ...c.children.map((x) => x.id)];
  }

  async buildWhere(q: ProductListQuery): Promise<Prisma.ProductWhereInput> {
    const and: Prisma.ProductWhereInput[] = [PUBLIC_PRODUCT];
    if (q.q) {
      const term = q.q;
      const ci = { contains: term, mode: 'insensitive' as const };
      and.push({
        OR: [
          { title: ci },
          { artist: { OR: [{ name: ci }, { nameEn: ci }] } },
          { maker: ci },
          { brand: ci },
          { era: ci },
          { material: ci },
          { category: { name: ci } },
          { seller: { profile: { nickname: ci } } },
        ],
      });
    }
    if (q.category) and.push({ categoryId: { in: await this.categoryIds(q.category) } });
    if (q.minPrice != null) and.push({ listPrice: { gte: BigInt(q.minPrice) } });
    if (q.maxPrice != null) and.push({ listPrice: { lte: BigInt(q.maxPrice) } });
    if (q.saleType?.length) and.push({ saleType: { in: q.saleType } });
    if (q.artist) and.push({ artistId: q.artist });
    if (q.seller) and.push({ sellerId: q.seller });
    if (q.yearFrom != null) and.push({ productionYear: { gte: q.yearFrom } });
    if (q.yearTo != null) and.push({ productionYear: { lte: q.yearTo } });
    if (q.era?.length)
      and.push({ OR: q.era.map((v) => ({ era: { contains: v, mode: 'insensitive' as const } })) });
    if (q.material?.length) {
      and.push({ OR: q.material.map((v) => ({ material: { contains: v, mode: 'insensitive' as const } })) });
    }
    if (q.condition?.length) and.push({ condition: { in: q.condition } });
    if (q.region?.length) and.push({ OR: q.region.map((v) => ({ region: { startsWith: v } })) });
    if (q.auctionOnly) and.push({ saleType: 'AUCTION' });
    if (q.verifiedOnly) and.push({ verificationStatus: 'VERIFIED' });
    if (q.sort === 'ending_soon') {
      and.push({ saleType: 'AUCTION', auction: { status: 'LIVE' } });
    }
    return { AND: and };
  }

  private orderBy(sort: ProductListQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ listPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
      case 'price_desc':
        return [{ listPrice: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
      case 'popular':
        return [{ favoriteCount: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }];
      case 'ending_soon':
        return [{ auction: { endsAt: 'asc' } }, { id: 'asc' }];
      default:
        return [{ publishedAt: 'desc' }, { id: 'asc' }];
    }
  }

  async list(q: ProductListQuery, viewer?: AuthUser): Promise<ProductListResponse> {
    const where = await this.buildWhere(q);
    const offset = decodeCursor(q.cursor);
    let rows;
    let total: number;

    if (q.q && q.sort === 'relevance') {
      const candidates = await this.prisma.product.findMany({
        where,
        select: {
          id: true,
          title: true,
          favoriteCount: true,
          artist: { select: { name: true, nameEn: true } },
        },
        take: RELEVANCE_CANDIDATES,
      });
      const term = q.q.toLowerCase();
      const score = (c: (typeof candidates)[number]) => {
        const title = c.title.toLowerCase();
        const artist = `${c.artist?.name ?? ''} ${c.artist?.nameEn ?? ''}`.toLowerCase();
        let s = 0;
        if (title === term) s += 100;
        else if (title.startsWith(term)) s += 60;
        else if (title.includes(term)) s += 40;
        if (artist.includes(term)) s += 50;
        return s + Math.log1p(c.favoriteCount);
      };
      const ordered = candidates.sort((a, b) => score(b) - score(a)).map((c) => c.id);
      total = ordered.length;
      const pageIds = ordered.slice(offset, offset + q.limit);
      const found = await this.prisma.product.findMany({
        where: { id: { in: pageIds } },
        include: cardInclude,
      });
      const byId = new Map(found.map((p) => [p.id, p]));
      rows = pageIds.map((id) => byId.get(id)!).filter(Boolean);
    } else {
      [rows, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: cardInclude,
          orderBy: this.orderBy(q.sort),
          skip: offset,
          take: q.limit,
        }),
        this.prisma.product.count({ where }),
      ]);
    }

    const favs = await this.favoriteSet(
      viewer?.id,
      rows.map((r) => r.id),
    );
    const next = offset + rows.length;
    return {
      items: rows.map((r) => toCard(r, favs)),
      nextCursor: next < total ? encodeCursor(next) : null,
      total,
    };
  }

  /** 필터 UI 용 선택지 (현재 카테고리 기준 상위 값) */
  async facets(category?: string): Promise<FacetsDto> {
    const where: Prisma.ProductWhereInput = category
      ? { AND: [PUBLIC_PRODUCT, { categoryId: { in: await this.categoryIds(category) } }] }
      : PUBLIC_PRODUCT;
    const [eras, materials, regions, range] = await Promise.all([
      this.prisma.product.groupBy({
        by: ['era'],
        where,
        _count: true,
        orderBy: { _count: { era: 'desc' } },
        take: 20,
      }),
      this.prisma.product.groupBy({
        by: ['material'],
        where,
        _count: true,
        orderBy: { _count: { material: 'desc' } },
        take: 20,
      }),
      this.prisma.product.groupBy({
        by: ['region'],
        where,
        _count: true,
        orderBy: { _count: { region: 'desc' } },
        take: 20,
      }),
      this.prisma.product.aggregate({ where, _min: { listPrice: true }, _max: { listPrice: true } }),
    ]);
    const clean = (rows: { value: string | null; count: number }[]) =>
      rows.filter((r): r is { value: string; count: number } => !!r.value);
    return {
      eras: clean(eras.map((r) => ({ value: r.era, count: r._count }))),
      materials: clean(materials.map((r) => ({ value: r.material, count: r._count }))),
      regions: clean(regions.map((r) => ({ value: r.region, count: r._count }))),
      priceRange:
        range._min.listPrice != null && range._max.listPrice != null
          ? { min: Number(range._min.listPrice), max: Number(range._max.listPrice) }
          : null,
    };
  }

  async suggest(q: string): Promise<SuggestDto> {
    const term = q.trim();
    if (term.length < 1) return { products: [], artists: [], categories: [] };
    const ci = { contains: term, mode: 'insensitive' as const };
    const [products, artists, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { AND: [PUBLIC_PRODUCT, { title: ci }] },
        select: { id: true, title: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        orderBy: { favoriteCount: 'desc' },
        take: 6,
      }),
      this.prisma.artist.findMany({
        where: { OR: [{ name: ci }, { nameEn: ci }] },
        select: { id: true, name: true, nameEn: true, birthYear: true, deathYear: true },
        take: 4,
      }),
      this.prisma.category.findMany({
        where: { name: ci, isActive: true },
        select: { slug: true, name: true },
        take: 3,
      }),
    ]);
    return {
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        image: p.images[0]
          ? {
              key: p.images[0].key,
              width: p.images[0].width,
              height: p.images[0].height,
              dominantColor: p.images[0].dominantColor,
            }
          : null,
      })),
      artists,
      categories,
    };
  }

  async detail(id: string, viewer?: AuthUser): Promise<ProductDetailDto> {
    const p = await this.prisma.product.findFirst({
      where: { id, OR: [VISIBLE_PRODUCT, ...(viewer ? [{ sellerId: viewer.id, deletedAt: null }] : [])] },
      include: detailInclude,
    });
    if (!p) throw new AppException('NOT_FOUND', '상품을 찾을 수 없습니다.');
    const favs = await this.favoriteSet(viewer?.id, [p.id]);
    return toDetail(p, viewer?.id, favs.has(p.id));
  }

  async related(id: string, viewer?: AuthUser) {
    const base = await this.prisma.product.findUnique({
      where: { id },
      select: { categoryId: true, artistId: true },
    });
    if (!base) throw new AppException('NOT_FOUND');
    const rows = await this.prisma.product.findMany({
      where: {
        AND: [
          PUBLIC_PRODUCT,
          { id: { not: id } },
          { OR: [{ categoryId: base.categoryId }, ...(base.artistId ? [{ artistId: base.artistId }] : [])] },
        ],
      },
      include: cardInclude,
      orderBy: [{ favoriteCount: 'desc' }, { publishedAt: 'desc' }],
      take: 12,
    });
    const favs = await this.favoriteSet(
      viewer?.id,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toCard(r, favs));
  }

  /** 조회수: 같은 사용자/IP 는 30분에 한 번만 센다. 로그인 시 최근 본 상품에 기록 */
  async recordView(id: string, viewerKey: string, userId?: string) {
    const exists = await this.prisma.product.findFirst({
      where: { id, ...VISIBLE_PRODUCT },
      select: { id: true },
    });
    if (!exists) throw new AppException('NOT_FOUND');
    const first = await this.redis.set(`view:${id}:${viewerKey}`, '1', 'EX', 1800, 'NX');
    if (first) await this.prisma.product.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    if (userId) {
      await this.prisma.recentView.upsert({
        where: { userId_productId: { userId, productId: id } },
        create: { userId, productId: id },
        update: { viewedAt: new Date() },
      });
      // 오래된 기록 정리
      const stale = await this.prisma.recentView.findMany({
        where: { userId },
        orderBy: { viewedAt: 'desc' },
        skip: RECENT_VIEWS_KEEP,
        select: { productId: true },
      });
      if (stale.length) {
        await this.prisma.recentView.deleteMany({
          where: { userId, productId: { in: stale.map((s) => s.productId) } },
        });
      }
    }
  }

  async home(viewer?: AuthUser): Promise<HomeDto> {
    const cacheKey = 'home:v1';
    const cached = await this.redis.get(cacheKey);
    const base = cached ? (JSON.parse(cached) as HomeDto) : await this.buildHome();
    if (!cached) await this.redis.set(cacheKey, JSON.stringify(base), 'EX', 60);
    if (!viewer) return base;
    // 개인화: 관심 여부만 사용자별로 덮어쓴다
    const all = [
      ...base.liveAuctions,
      ...base.endingSoon,
      ...base.upcomingAuctions,
      ...base.popular,
      ...base.newArrivals,
      ...base.collections.flatMap((c) => c.items),
    ];
    const favs = await this.favoriteSet(viewer.id, [...new Set(all.map((c) => c.id))]);
    const mark = <T extends { id: string; isFavorite: boolean }>(list: T[]) =>
      list.map((c) => ({ ...c, isFavorite: favs.has(c.id) }));
    return {
      ...base,
      liveAuctions: mark(base.liveAuctions),
      endingSoon: mark(base.endingSoon),
      upcomingAuctions: mark(base.upcomingAuctions),
      popular: mark(base.popular),
      newArrivals: mark(base.newArrivals),
      collections: base.collections.map((c) => ({ ...c, items: mark(c.items) })),
    };
  }

  private async buildHome(): Promise<HomeDto> {
    const cards = async (
      where: Prisma.ProductWhereInput,
      orderBy: Prisma.ProductOrderByWithRelationInput[],
      take = 12,
    ) =>
      (
        await this.prisma.product.findMany({
          where: { AND: [PUBLIC_PRODUCT, where] },
          include: cardInclude,
          orderBy,
          take,
        })
      ).map((r) => toCard(r));

    const [liveAuctions, endingSoon, upcomingAuctions, popular, newArrivals, popularArtists, notices] =
      await Promise.all([
        cards({ auction: { status: 'LIVE' } }, [{ auction: { bidCount: 'desc' } }]),
        cards({ auction: { status: 'LIVE' } }, [{ auction: { endsAt: 'asc' } }], 8),
        cards({ auction: { status: 'SCHEDULED' } }, [{ auction: { startsAt: 'asc' } }], 8),
        cards({}, [{ favoriteCount: 'desc' }, { viewCount: 'desc' }]),
        cards({}, [{ publishedAt: 'desc' }]),
        this.popularArtists(10),
        this.prisma.notice.findMany({
          orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
          take: 3,
          select: { id: true, title: true, publishedAt: true },
        }),
      ]);

    // 추천 컬렉션: 상품이 많은 하위 카테고리 3개
    const topCategories = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: PUBLIC_PRODUCT,
      _count: true,
      orderBy: { _count: { categoryId: 'desc' } },
      take: 3,
    });
    const collections = await Promise.all(
      topCategories.map(async (tc) => {
        const category = await this.prisma.category.findUniqueOrThrow({
          where: { id: tc.categoryId },
          select: { slug: true, name: true },
        });
        return {
          category,
          items: await cards({ categoryId: tc.categoryId }, [{ favoriteCount: 'desc' }], 4),
        };
      }),
    );

    return {
      liveAuctions,
      endingSoon,
      upcomingAuctions,
      popular,
      newArrivals,
      popularArtists,
      collections,
      notices: notices.map((n) => ({ ...n, publishedAt: n.publishedAt.toISOString() })),
    };
  }

  async popularArtists(take: number): Promise<ArtistDto[]> {
    const artists = await this.prisma.artist.findMany({
      where: { products: { some: PUBLIC_PRODUCT } },
      include: {
        products: {
          where: PUBLIC_PRODUCT,
          orderBy: { favoriteCount: 'desc' },
          select: { favoriteCount: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    return artists
      .map((a) => ({ a, score: a.products.reduce((s, p) => s + p.favoriteCount + 5, 0) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, take)
      .map(({ a }) => {
        const img = a.products[0]?.images[0];
        return {
          id: a.id,
          name: a.name,
          nameEn: a.nameEn,
          birthYear: a.birthYear,
          deathYear: a.deathYear,
          nationality: a.nationality,
          bio: a.bio,
          productCount: a.products.length,
          image: img
            ? { key: img.key, width: img.width, height: img.height, dominantColor: img.dominantColor }
            : null,
        };
      });
  }

  async inquiries(productId: string, viewer?: AuthUser): Promise<InquiryDto[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true },
    });
    if (!product) throw new AppException('NOT_FOUND');
    const rows = await this.prisma.inquiry.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { profile: { select: { nickname: true } } } } },
    });
    return rows.map((r) => {
      const isMine = viewer?.id === r.userId;
      const hidden = r.isPrivate && !isMine && viewer?.id !== product.sellerId;
      return {
        id: r.id,
        question: hidden ? '비밀 문의입니다.' : r.question,
        answer: hidden ? null : r.answer,
        answeredAt: r.answeredAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        isPrivate: r.isPrivate,
        hidden,
        authorNickname: r.user.profile?.nickname ?? '탈퇴한 사용자',
        isMine,
      };
    });
  }
}
