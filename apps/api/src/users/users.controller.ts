import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import type { PublicProfileDto } from '@shop/shared';
import { z } from 'zod';
import { AppException } from '../common/app-exception';
import { CurrentUser, OptionalAuth, type AuthUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { cardInclude, toCard, VISIBLE_PRODUCT } from '../products/product.mapper';
import { ProductsModule } from '../products/products.controller';
import { ProductsService } from '../products/products.service';

const productsQuery = z.object({ tab: z.enum(['selling', 'sold']).default('selling') });

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  /** 공개 프로필 — 이메일·연락처 등 개인정보는 포함하지 않는다 (docs/SECURITY.md) */
  @OptionalAuth()
  @Get(':id')
  async profile(@Param('id') id: string, @CurrentUser() viewer?: AuthUser): Promise<PublicProfileDto> {
    const u = await this.prisma.user.findFirst({
      where: { id, status: { not: 'DELETED' } },
      select: {
        id: true,
        role: true,
        createdAt: true,
        profile: true,
        seller: { select: { userId: true } },
        _count: { select: { followers: true, following: true } },
      },
    });
    if (!u?.profile) throw new AppException('NOT_FOUND', '사용자를 찾을 수 없습니다.');
    const [sellingCount, soldCount, following] = await Promise.all([
      this.prisma.product.count({
        where: {
          sellerId: id,
          deletedAt: null,
          publishedAt: { not: null },
          status: { in: ['ACTIVE', 'RESERVED'] },
        },
      }),
      this.prisma.product.count({ where: { sellerId: id, deletedAt: null, status: 'SOLD' } }),
      viewer
        ? this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: viewer.id, followingId: id } },
          })
        : null,
    ]);
    return {
      id: u.id,
      nickname: u.profile.nickname,
      bio: u.profile.bio,
      avatarKey: u.profile.avatarKey,
      region: u.profile.region,
      ratingAvg: Math.round(u.profile.ratingAvg * 10) / 10,
      ratingCount: u.profile.ratingCount,
      tradeCount: u.profile.tradeCount,
      verified: u.role === 'VERIFIED_SELLER',
      isSeller: !!u.seller,
      followerCount: u._count.followers,
      followingCount: u._count.following,
      sellingCount,
      soldCount,
      isFollowing: !!following,
      joinedAt: u.createdAt.toISOString(),
    };
  }

  @OptionalAuth()
  @Get(':id/products')
  async userProducts(
    @Param('id') id: string,
    @Query(new ZodPipe(productsQuery)) q: { tab: 'selling' | 'sold' },
    @CurrentUser() viewer?: AuthUser,
  ) {
    const rows = await this.prisma.product.findMany({
      where: {
        AND: [
          VISIBLE_PRODUCT,
          { sellerId: id },
          { status: q.tab === 'sold' ? 'SOLD' : { in: ['ACTIVE', 'RESERVED'] } },
        ],
      },
      include: cardInclude,
      orderBy: { publishedAt: 'desc' },
      take: 120,
    });
    const favs = await this.products.favoriteSet(
      viewer?.id,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toCard(r, favs));
  }
}

@Module({ imports: [ProductsModule], controllers: [UsersController] })
export class UsersModule {}
