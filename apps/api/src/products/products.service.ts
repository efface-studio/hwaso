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
import { SafetyService } from '../safety/safety.controller';
import {
  cardSelect,
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
/** 홈 섹션 캐시 키 — 상품·경매가 바뀌면 지운다 */
export const HOME_CACHE_KEY = 'home:v2';
/** 홈 재생성 중 다른 요청에 내줄 직전 값 (무효화해도 지우지 않는다) */
const HOME_STALE_KEY = `${HOME_CACHE_KEY}:stale`;
const HOME_LOCK_KEY = `${HOME_CACHE_KEY}:lock`;
const HOME_TTL_SEC = 60;
const POPULAR_ARTISTS_TTL_SEC = 300;

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
    if (q.sort === 'ending_soon') {
      and.push({ saleType: 'AUCTION', auction: { status: 'LIVE' } });
    }
    return { AND: and };
  }

  /**
   * 검색어가 들어간 공개 상품 id (docs/ARCHITECTURE.md §7). 조인한 OR ILIKE 는 trigram 인덱스를 못 타므로
   * 테이블별 ILIKE 를 UNION 한다. 제작자·브랜드·시대·소재는 product_search_trgm 과 같은 식으로 후보를 좁힌 뒤
   * 필드별로 다시 확인한다 (필드 경계를 넘는 일치 제외). 후보가 SEARCH_ID_LIMIT 를 넘으면 null.
   */
  private async searchIds(term: string): Promise<string[] | null> {
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
      case 'ending_soon':
        return [{ auction: { endsAt: 'asc' } }, { id: 'asc' }];
      default:
        return [{ publishedAt: 'desc' }, { id: 'asc' }];
    }
  }

  async list(q: ProductListQuery, viewer?: AuthUser): Promise<ProductListResponse> {
    // 내가 차단한 판매자의 작품은 목록에서 뺀다
    const where: Prisma.ProductWhereInput = {
      AND: [await this.buildWhere(q), await this.safety.excludeBlocked(viewer?.id, 'sellerId')],
    };
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
        select: cardSelect,
      });
      const byId = new Map(found.map((p) => [p.id, p]));
      rows = pageIds.map((id) => byId.get(id)!).filter(Boolean);
    } else {
      [rows, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          select: cardSelect,
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
    const [favs, blocked] = await Promise.all([
      this.favoriteSet(viewer?.id, [p.id]),
      this.safety.blockedIds(viewer?.id),
    ]);
    // 차단한 판매자의 작품도 링크로 들어오면 열리되, 클라이언트가 가림 처리하도록 표시한다
    return toDetail(p, viewer?.id, favs.has(p.id), blocked.includes(p.sellerId));
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
          await this.safety.excludeBlocked(viewer?.id, 'sellerId'),
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
    const blockedSellers = await this.safety.blockedIds(viewer.id);
    const [favs, hidden] = await Promise.all([
      this.favoriteSet(viewer.id, ids),
      blockedSellers.length
        ? this.prisma.product
            .findMany({ where: { id: { in: ids }, sellerId: { in: blockedSellers } }, select: { id: true } })
            .then((rows) => new Set(rows.map((r) => r.id)))
        : new Set<string>(),
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
    ] = await Promise.all([
      this.prisma.banner.findMany({
        where: { isActive: true, placement: 'home', startsAt: { lte: now }, endsAt: { gt: now } },
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

  /** 인기 작가: 공개 작품의 (관심 수 + 5) 합계 순. 작품 수가 많아도 작가 단위로 집계해 상위 take 명만 읽는다 (Redis 5분) */
  async popularArtists(take: number): Promise<ArtistDto[]> {
    const key = `artists:popular:${take}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as ArtistDto[];
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        nameEn: string | null;
        birthYear: number | null;
        deathYear: number | null;
        nationality: string | null;
        bio: string;
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
      SELECT a.id, a.name, a."nameEn", a."birthYear", a."deathYear", a.nationality, a.bio, top."productCount",
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
    const result: ArtistDto[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameEn: r.nameEn,
      birthYear: r.birthYear,
      deathYear: r.deathYear,
      nationality: r.nationality,
      bio: r.bio,
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
