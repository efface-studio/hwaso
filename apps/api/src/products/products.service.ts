import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ArtistCardDto,
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
import { SafetyService } from '../safety/safety.controller';
import { catalogCached, HOME_CACHE_KEY } from './catalog-cache';
import {
  cardSelect,
  type CardRow,
  detailInclude,
  PUBLIC_PRODUCT,
  PUBLIC_PRODUCT_SQL,
  toCard,
  toDetail,
  VISIBLE_PRODUCT,
} from './product.mapper';

/** ponytail: 관련도 정렬은 일치 후보 최대 500건을 앱에서 점수화 — 카탈로그가 커지면 OpenSearch 로 전환 (docs/ARCHITECTURE.md §7) */
const RELEVANCE_CANDIDATES = 500;
/** 검색 후보 id 가 이보다 많으면(흔한 검색어) id 목록 대신 기존 OR 조건으로 찾는다 */
const SEARCH_ID_LIMIT = 5000;
const RECENT_VIEWS_KEEP = 50;
export { HOME_CACHE_KEY };
/** 홈 재생성 중 다른 요청에 내줄 직전 값 (무효화해도 지우지 않는다) */
const HOME_STALE_KEY = `${HOME_CACHE_KEY}:stale`;
const HOME_LOCK_KEY = `${HOME_CACHE_KEY}:lock`;
const HOME_TTL_SEC = 60;
const POPULAR_ARTISTS_TTL_SEC = 300;
/** 목록 전체 개수·검색 후보·필터 선택지 캐시 (catalog-cache.ts — 상품이 바뀌면 세대가 올라 바로 무효) */
const COUNT_TTL_SEC = 30;
const SEARCH_TTL_SEC = 60;
const FACETS_TTL_SEC = 60;

export const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url');

/**
 * limit+1 건을 읽은 결과로 다음 페이지 여부를 정한다. 전체 개수는 다음 페이지가 있을 때만 센다
 * (마지막 페이지면 offset + 건수가 곧 전체 개수. 빈 페이지인데 offset 이 있으면 커서가 끝을 넘은 것이라 센다)
 */
export async function paginate<T>(found: T[], limit: number, offset: number, count: () => Promise<number>) {
  const rows = found.slice(0, limit);
  const hasMore = found.length > limit;
  let total = offset + rows.length;
  if (hasMore || (!rows.length && offset)) {
    const n = await count();
    // 캐시된 개수가 조금 낡았어도 다음 페이지가 있다는 사실과 어긋나지 않게
    total = hasMore ? Math.max(n, offset + found.length) : n;
  }
  return { rows, nextCursor: hasMore ? encodeCursor(offset + rows.length) : null, total };
}
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
    private readonly safety: SafetyService,
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
      const ids = await this.searchIds(q.q);
      if (ids) and.push({ id: { in: ids } });
      else {
        const ci = { contains: q.q, mode: 'insensitive' as const };
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
    // 마감 임박순의 "진행 중 경매" 조건은 list() 가 경매 쪽 조건(status LIVE)으로 건다
    if (q.sort === 'ending_soon') and.push({ saleType: 'AUCTION' });
    return { AND: and };
  }

  /**
   * 검색어가 들어간 공개 상품 id (docs/ARCHITECTURE.md §7). 조인한 OR ILIKE 는 trigram 인덱스를 못 타므로
   * 테이블별 ILIKE 를 UNION 한다. 제작자·브랜드·시대·소재는 product_search_trgm 과 같은 식으로 후보를 좁힌 뒤
   * 필드별로 다시 확인한다 (필드 경계를 넘는 일치 제외). 후보가 SEARCH_ID_LIMIT 를 넘으면 null.
   * 두 글자 검색어는 trigram 인덱스를 못 타 표를 훑으므로 결과를 검색어별로 캐시한다 (목록 쿼리가 공개 조건을 다시 확인)
   */
  private searchIds(term: string): Promise<string[] | null> {
    return catalogCached(this.redis, 'search', term, SEARCH_TTL_SEC, () => this.findSearchIds(term));
  }

  private async findSearchIds(term: string): Promise<string[] | null> {
    // Prisma contains 와 같은 패턴 — 와일드카드(%, _)를 이스케이프하지 않는다
    const like = `%${term}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p
      WHERE ${PUBLIC_PRODUCT_SQL}
        AND p.id IN (
          SELECT id FROM "Product" WHERE "title" ILIKE ${like}
          UNION ALL
          SELECT id FROM "Product"
          WHERE (coalesce("maker", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("era", '') || ' ' || coalesce("material", '')) ILIKE ${like}
            AND ("maker" ILIKE ${like} OR "brand" ILIKE ${like} OR "era" ILIKE ${like} OR "material" ILIKE ${like})
          UNION ALL
          SELECT x.id FROM "Product" x JOIN "Artist" a ON a.id = x."artistId" WHERE a."name" ILIKE ${like}
          UNION ALL
          SELECT x.id FROM "Product" x JOIN "Artist" a ON a.id = x."artistId" WHERE a."nameEn" ILIKE ${like}
          UNION ALL
          SELECT x.id FROM "Product" x JOIN "Category" c ON c.id = x."categoryId" WHERE c."name" ILIKE ${like}
          UNION ALL
          SELECT x.id FROM "Product" x JOIN "Profile" f ON f."userId" = x."sellerId" WHERE f."nickname" ILIKE ${like}
        )
      LIMIT ${SEARCH_ID_LIMIT + 1}`;
    return rows.length > SEARCH_ID_LIMIT ? null : rows.map((r) => r.id);
  }

  private orderBy(sort: ProductListQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ listPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
      case 'price_desc':
        return [{ listPrice: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
      case 'popular':
        return [{ favoriteCount: 'desc' }, { viewCount: 'desc' }, { id: 'asc' }];
      default:
        return [{ publishedAt: 'desc' }, { id: 'asc' }];
    }
  }

  async list(q: ProductListQuery, viewer?: AuthUser): Promise<ProductListResponse> {
    // 내가 차단한 판매자의 작품은 목록에서 뺀다
    const [filter, notBlocked] = await Promise.all([
      this.buildWhere(q),
      this.safety.excludeBlocked(viewer?.id, 'sellerId'),
    ]);
    const where: Prisma.ProductWhereInput = { AND: [filter, notBlocked] };
    const offset = decodeCursor(q.cursor);
    let page: { rows: CardRow[]; nextCursor: string | null; total: number };

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
      const rows = await this.cardsByIds(ordered.slice(offset, offset + q.limit));
      const next = offset + rows.length;
      page = { rows, nextCursor: next < ordered.length ? encodeCursor(next) : null, total: ordered.length };
    } else if (q.sort === 'ending_soon') {
      // 경매(status, endsAt) 인덱스에서 출발한다 — 상품 쪽에서 경매 종료 시각으로 정렬하면 상품 표 전체를 훑는다
      const auctionWhere: Prisma.AuctionWhereInput = { status: 'LIVE', product: where };
      const ids = await this.prisma.auction.findMany({
        where: auctionWhere,
        // productId 는 경매마다 하나라 기존 상품 id 동순위 정렬과 같다
        orderBy: [{ endsAt: 'asc' }, { productId: 'asc' }],
        select: { productId: true },
        skip: offset,
        take: q.limit + 1,
      });
      const idPage = await paginate(
        ids.map((a) => a.productId),
        q.limit,
        offset,
        () => this.countCached('ending', where, () => this.prisma.auction.count({ where: auctionWhere })),
      );
      page = { ...idPage, rows: await this.cardsByIds(idPage.rows) };
    } else {
      const found = await this.prisma.product.findMany({
        where,
        select: cardSelect,
        orderBy: this.orderBy(q.sort),
        skip: offset,
        take: q.limit + 1,
      });
      page = await paginate(found, q.limit, offset, () =>
        this.countCached('products', where, () => this.prisma.product.count({ where })),
      );
    }

    const favs = await this.favoriteSet(
      viewer?.id,
      page.rows.map((r) => r.id),
    );
    return { items: page.rows.map((r) => toCard(r, favs)), nextCursor: page.nextCursor, total: page.total };
  }

  /** 목록 전체 개수 (30초 캐시, 상품이 바뀌면 세대가 올라 무효) — where 가 같으면 같은 키 */
  countCached(name: string, where: unknown, count: () => Promise<number>): Promise<number> {
    return catalogCached(this.redis, `count:${name}`, where, COUNT_TTL_SEC, count);
  }

  /** id 순서대로 카드를 읽는다 (빠진 id 는 건너뛴다) */
  async cardsByIds(ids: string[]): Promise<CardRow[]> {
    if (!ids.length) return [];
    const found = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: cardSelect });
    const byId = new Map(found.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is CardRow => !!p);
  }

  /** 필터 UI 용 선택지 (현재 카테고리 기준 상위 값). 공개 상품 전체를 집계하므로 60초 캐시 */
  facets(category?: string): Promise<FacetsDto> {
    return catalogCached(this.redis, 'facets', category ?? '', FACETS_TTL_SEC, () =>
      this.buildFacets(category),
    );
  }

  private async buildFacets(category?: string): Promise<FacetsDto> {
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
    // 관심·차단 여부는 상품 id 만 있으면 되므로 상품 조회와 함께 읽는다
    const [p, favs, blocked] = await Promise.all([
      this.prisma.product.findFirst({
        where: { id, OR: [VISIBLE_PRODUCT, ...(viewer ? [{ sellerId: viewer.id, deletedAt: null }] : [])] },
        include: detailInclude,
      }),
      this.favoriteSet(viewer?.id, [id]),
      this.safety.blockedIds(viewer?.id),
    ]);
    if (!p) throw new AppException('NOT_FOUND', '상품을 찾을 수 없습니다.');
    // 차단한 판매자의 작품도 링크로 들어오면 열리되, 클라이언트가 가림 처리하도록 표시한다
    return toDetail(p, viewer?.id, favs.has(p.id), blocked.includes(p.sellerId));
  }

  async related(id: string, viewer?: AuthUser) {
    const [base, notBlocked] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id },
        select: { categoryId: true, artistId: true },
      }),
      this.safety.excludeBlocked(viewer?.id, 'sellerId'),
    ]);
    if (!base) throw new AppException('NOT_FOUND');
    const rows = await this.prisma.product.findMany({
      where: {
        AND: [
          PUBLIC_PRODUCT,
          notBlocked,
          { id: { not: id } },
          { OR: [{ categoryId: base.categoryId }, ...(base.artistId ? [{ artistId: base.artistId }] : [])] },
        ],
      },
      select: cardSelect,
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
    // 조회수 증가로 updatedAt(sitemap lastModified 등)이 바뀌지 않도록 직접 갱신한다
    if (first)
      await this.prisma.$executeRaw`UPDATE "Product" SET "viewCount" = "viewCount" + 1 WHERE id = ${id}`;
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
    const base = await this.homeBase();
    if (!viewer) return base;
    // 개인화: 관심 여부를 사용자별로 덮어쓰고, 차단한 판매자의 작품은 뺀다
    const all = [
      ...base.liveAuctions,
      ...base.endingSoon,
      ...base.upcomingAuctions,
      ...base.popular,
      ...base.newArrivals,
      ...base.collections.flatMap((c) => c.items),
    ];
    const ids = [...new Set(all.map((c) => c.id))];
    const [favs, hidden] = await Promise.all([
      this.favoriteSet(viewer.id, ids),
      this.safety.blockedIds(viewer.id).then(async (blockedSellers) =>
        blockedSellers.length
          ? new Set(
              (
                await this.prisma.product.findMany({
                  where: { id: { in: ids }, sellerId: { in: blockedSellers } },
                  select: { id: true },
                })
              ).map((r) => r.id),
            )
          : new Set<string>(),
      ),
    ]);
    const mark = <T extends { id: string; isFavorite: boolean }>(list: T[]) =>
      list.filter((c) => !hidden.has(c.id)).map((c) => ({ ...c, isFavorite: favs.has(c.id) }));
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

  /**
   * 홈 공통 섹션 (Redis 60초). 캐시가 비면 잠금(SET NX)을 잡은 한 요청만 다시 만든다.
   * 나머지는 직전 값이 있으면 그것을, 없으면 잠시 기다렸다가 새 값을 쓴다.
   */
  private async homeBase(): Promise<HomeDto> {
    const cached = await this.redis.get(HOME_CACHE_KEY);
    if (cached) return JSON.parse(cached) as HomeDto;
    const locked = await this.redis.set(HOME_LOCK_KEY, '1', 'EX', 10, 'NX');
    if (!locked) {
      const stale = await this.redis.get(HOME_STALE_KEY);
      if (stale) return JSON.parse(stale) as HomeDto;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const fresh = await this.redis.get(HOME_CACHE_KEY);
        if (fresh) return JSON.parse(fresh) as HomeDto;
      }
      // 만드는 쪽이 1초 넘게 걸리면 직접 만든다 (캐시는 그쪽이 채운다)
      return this.buildHome();
    }
    try {
      const base = await this.buildHome();
      const json = JSON.stringify(base);
      await this.redis
        .multi()
        .set(HOME_CACHE_KEY, json, 'EX', HOME_TTL_SEC)
        .set(HOME_STALE_KEY, json, 'EX', HOME_TTL_SEC * 10)
        .exec();
      return base;
    } finally {
      await this.redis.del(HOME_LOCK_KEY);
    }
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
          select: cardSelect,
          orderBy,
          take,
        })
      ).map((r) => toCard(r));

    const now = new Date();
    const [
      banners,
      liveAuctions,
      endingSoon,
      upcomingAuctions,
      popular,
      newArrivals,
      popularArtists,
      notices,
      topCategories,
    ] = await Promise.all([
      this.prisma.banner.findMany({
        where: { isActive: true, placement: 'home', startsAt: { lte: now }, endsAt: { gt: now } },
        select: { id: true, title: true, subtitle: true, tone: true, imageKey: true, link: true },
        orderBy: { sortOrder: 'asc' },
        take: 8,
      }),
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
      // 추천 컬렉션: 상품이 많은 하위 카테고리 3개
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: PUBLIC_PRODUCT,
        _count: true,
        orderBy: { _count: { categoryId: 'desc' } },
        take: 3,
      }),
    ]);

    const [categories, collectionItems] = await Promise.all([
      this.prisma.category.findMany({
        where: { id: { in: topCategories.map((tc) => tc.categoryId) } },
        select: { id: true, slug: true, name: true },
      }),
      Promise.all(
        topCategories.map((tc) => cards({ categoryId: tc.categoryId }, [{ favoriteCount: 'desc' }], 4)),
      ),
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, { slug: c.slug, name: c.name }]));
    const collections = topCategories.flatMap((tc, i) => {
      const category = categoryById.get(tc.categoryId);
      return category ? [{ category, items: collectionItems[i]! }] : [];
    });

    return {
      banners: banners.map((b) => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        tone: b.tone === 'light' ? 'light' : 'dark',
        imageKey: b.imageKey,
        link: b.link,
      })),
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

  /** 인기 작가: 공개 작품의 (관심 수 + 5) 합계 순. 작품 수가 많아도 작가 단위로 집계해 상위 take 명만 읽는다 (Redis 5분). 레일에 그리는 필드만 */
  async popularArtists(take: number): Promise<ArtistCardDto[]> {
    const key = `artists:popular:v2:${take}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as ArtistCardDto[];
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        productCount: bigint;
        key: string | null;
        width: number | null;
        height: number | null;
        dominantColor: string | null;
      }[]
    >`
      WITH top AS (
        SELECT p."artistId" AS id, sum(p."favoriteCount" + 5) AS score, count(*) AS "productCount"
        FROM "Product" p
        WHERE p."artistId" IS NOT NULL AND ${PUBLIC_PRODUCT_SQL}
        GROUP BY p."artistId"
        ORDER BY score DESC, p."artistId"
        LIMIT ${take}
      )
      SELECT a.id, a.name, top."productCount",
        img.key, img.width, img.height, img."dominantColor"
      FROM top
      JOIN "Artist" a ON a.id = top.id
      LEFT JOIN LATERAL (
        SELECT p.id FROM "Product" p
        WHERE p."artistId" = top.id AND ${PUBLIC_PRODUCT_SQL}
        ORDER BY p."favoriteCount" DESC, p.id
        LIMIT 1
      ) best ON true
      LEFT JOIN LATERAL (
        SELECT i.key, i.width, i.height, i."dominantColor" FROM "ProductImage" i
        WHERE i."productId" = best.id
        ORDER BY i."sortOrder"
        LIMIT 1
      ) img ON true
      ORDER BY top.score DESC, top.id`;
    // 대표 이미지는 관심 수가 가장 많은 작품의 첫 이미지
    const result: ArtistCardDto[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      productCount: Number(r.productCount),
      image:
        r.key != null
          ? { key: r.key, width: r.width!, height: r.height!, dominantColor: r.dominantColor! }
          : null,
    }));
    await this.redis.set(key, JSON.stringify(result), 'EX', POPULAR_ARTISTS_TTL_SEC);
    return result;
  }

  async inquiries(productId: string, viewer?: AuthUser): Promise<InquiryDto[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true },
    });
    if (!product) throw new AppException('NOT_FOUND');
    const rows = await this.prisma.inquiry.findMany({
      where: { productId, ...(await this.safety.excludeBlocked(viewer?.id, 'userId')) },
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
