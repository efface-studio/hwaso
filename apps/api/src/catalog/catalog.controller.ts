import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import type { ArtistDto, CategoryNode } from '@shop/shared';
import { z } from 'zod';
import { AppException } from '../common/app-exception';
import { Public } from '../common/auth';
import { PublicCache } from '../common/http-cache';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { imageSelect, PUBLIC_PRODUCT } from '../products/product.mapper';
import { ProductsModule } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { RedisService } from '../redis/redis.service';

export const CATEGORY_CACHE_KEY = 'categories:v2';

const artistQuery = z.object({ q: z.string().trim().max(50).default('') });

@Controller()
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly products: ProductsService,
  ) {}

  /** 카테고리 트리 (60초 캐시, 관리자 수정 시 무효화) */
  @Public()
  @PublicCache(60)
  @Get('categories')
  async categories(): Promise<CategoryNode[]> {
    const cached = await this.redis.get(CATEGORY_CACHE_KEY);
    if (cached) return JSON.parse(cached) as CategoryNode[];
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, group: true, parentId: true },
    });
    const counts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: PUBLIC_PRODUCT,
      _count: { _all: true },
    });
    const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    // ponytail: 카테고리마다 findFirst 한 번 (소분류 20여 개, 60초 캐시). 카테고리가 수백 개가 되면 DISTINCT ON 한 번으로
    const covers = new Map(
      await Promise.all(
        rows.map(async (r) => {
          const p = await this.prisma.product.findFirst({
            where: { ...PUBLIC_PRODUCT, categoryId: r.id },
            orderBy: [{ favoriteCount: 'desc' }, { createdAt: 'desc' }],
            select: { images: { select: imageSelect, orderBy: { sortOrder: 'asc' }, take: 1 } },
          });
          return [r.id, p?.images[0] ?? null] as const;
        }),
      ),
    );
    const node = (r: (typeof rows)[number]): CategoryNode => {
      const children = rows.filter((c) => c.parentId === r.id).map(node);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        group: r.group,
        productCount: (countOf.get(r.id) ?? 0) + children.reduce((s, c) => s + c.productCount, 0),
        coverImage: covers.get(r.id) ?? children.find((c) => c.coverImage)?.coverImage ?? null,
        children,
      };
    };
    const tree = rows.filter((r) => !r.parentId).map(node);
    await this.redis.set(CATEGORY_CACHE_KEY, JSON.stringify(tree), 'EX', 60);
    return tree;
  }

  /** 웹 sitemap.xml 용 공개 URL 목록 */
  @Public()
  @PublicCache(300)
  @Get('sitemap')
  async sitemap() {
    const [products, categories, artists] = await Promise.all([
      this.prisma.product.findMany({
        where: PUBLIC_PRODUCT,
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 45_000,
      }),
      this.prisma.category.findMany({ where: { isActive: true }, select: { slug: true } }),
      this.prisma.artist.findMany({ where: { products: { some: PUBLIC_PRODUCT } }, select: { id: true } }),
    ]);
    return {
      products: products.map((p) => ({ id: p.id, updatedAt: p.updatedAt.toISOString() })),
      categories: categories.map((c) => c.slug),
      artists: artists.map((a) => a.id),
    };
  }

  @Public()
  @PublicCache(60)
  @Get('artists')
  async artists(@Query(new ZodPipe(artistQuery)) q: { q: string }) {
    const ci = { contains: q.q, mode: 'insensitive' as const };
    return this.prisma.artist.findMany({
      where: q.q ? { OR: [{ name: ci }, { nameEn: ci }] } : undefined,
      select: { id: true, name: true, nameEn: true, birthYear: true, deathYear: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  @Public()
  @Get('artists/popular')
  popular() {
    return this.products.popularArtists(20);
  }

  @Public()
  @PublicCache(60)
  @Get('artists/:id')
  async artist(@Param('id') id: string): Promise<ArtistDto> {
    const a = await this.prisma.artist.findUnique({
      where: { id },
      include: {
        products: {
          where: PUBLIC_PRODUCT,
          take: 1,
          orderBy: { favoriteCount: 'desc' },
          select: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        },
        _count: { select: { products: { where: PUBLIC_PRODUCT } } },
      },
    });
    if (!a) throw new AppException('NOT_FOUND', '작가 정보를 찾을 수 없습니다.');
    const img = a.products[0]?.images[0];
    return {
      id: a.id,
      name: a.name,
      nameEn: a.nameEn,
      birthYear: a.birthYear,
      deathYear: a.deathYear,
      nationality: a.nationality,
      bio: a.bio,
      productCount: a._count.products,
      image: img
        ? { key: img.key, width: img.width, height: img.height, dominantColor: img.dominantColor }
        : null,
    };
  }
}

@Module({ imports: [ProductsModule], controllers: [CatalogController] })
export class CatalogModule {}
