import { Injectable } from '@nestjs/common';
import type { FollowUserDto } from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/auth';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { cardInclude, PUBLIC_PRODUCT, toCard } from '../products/product.mapper';
import { decodeCursor, encodeCursor, ProductsService } from '../products/products.service';
import { SafetyService } from '../safety/safety.controller';

const PAGE = 30;

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly products: ProductsService,
    private readonly safety: SafetyService,
  ) {}

  async follow(user: AuthUser, targetId: string) {
    if (user.id === targetId) throw new AppException('VALIDATION_FAILED', '본인은 팔로우할 수 없습니다.');
    const target = await this.prisma.user.count({ where: { id: targetId, status: { not: 'DELETED' } } });
    if (!target) throw new AppException('NOT_FOUND');
    const existed = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: user.id, followingId: targetId } },
    });
    if (!existed) {
      await this.prisma.follow.create({ data: { followerId: user.id, followingId: targetId } });
      const me = await this.prisma.profile.findUnique({
        where: { userId: user.id },
        select: { nickname: true },
      });
      await this.notifications.notify(targetId, {
        type: 'FOLLOWED',
        title: `${me?.nickname ?? '누군가'}님이 회원님을 팔로우해요`,
        body: '프로필을 둘러보세요.',
        link: `/users/${user.id}`,
      });
    }
    return {
      following: true,
      followerCount: await this.prisma.follow.count({ where: { followingId: targetId } }),
    };
  }

  async unfollow(user: AuthUser, targetId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId: user.id, followingId: targetId } });
    return {
      following: false,
      followerCount: await this.prisma.follow.count({ where: { followingId: targetId } }),
    };
  }

  /** 팔로워 / 팔로잉 목록 (보는 사람 기준 팔로우 여부 포함) */
  async list(userId: string, kind: 'followers' | 'following', cursor: string | undefined, viewerId?: string) {
    const offset = decodeCursor(cursor);
    const where = kind === 'followers' ? { followingId: userId } : { followerId: userId };
    const rows = await this.prisma.follow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: PAGE + 1,
      include: {
        follower: { select: { id: true, profile: true } },
        following: { select: { id: true, profile: true } },
      },
    });
    const users = rows.slice(0, PAGE).map((r) => (kind === 'followers' ? r.follower : r.following));
    const ids = users.map((u) => u.id);
    const [mine, selling] = await Promise.all([
      viewerId
        ? this.prisma.follow.findMany({
            where: { followerId: viewerId, followingId: { in: ids } },
            select: { followingId: true },
          })
        : [],
      this.prisma.product.groupBy({
        by: ['sellerId'],
        where: { sellerId: { in: ids }, ...PUBLIC_PRODUCT },
        _count: true,
      }),
    ]);
    const followed = new Set(mine.map((m) => m.followingId));
    const items: FollowUserDto[] = users.map((u) => ({
      id: u.id,
      nickname: u.profile?.nickname ?? '탈퇴한 회원',
      avatarKey: u.profile?.avatarKey ?? null,
      bio: u.profile?.bio ?? '',
      isFollowing: followed.has(u.id),
      sellingCount: selling.find((s) => s.sellerId === u.id)?._count ?? 0,
    }));
    return { items, nextCursor: rows.length > PAGE ? encodeCursor(offset + PAGE) : null };
  }

  /** 팔로우한 판매자의 새 작품 (최신 게시순) */
  async feed(user: AuthUser, cursor: string | undefined) {
    const offset = decodeCursor(cursor);
    const where = {
      ...PUBLIC_PRODUCT,
      ...(await this.safety.excludeBlocked(user.id, 'sellerId')),
      seller: { followers: { some: { followerId: user.id } } },
    };
    const rows = await this.prisma.product.findMany({
      where,
      include: cardInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: 24 + 1,
    });
    const page = rows.slice(0, 24);
    const favs = await this.products.favoriteSet(
      user.id,
      page.map((p) => p.id),
    );
    return {
      items: page.map((p) => toCard(p, favs)),
      nextCursor: rows.length > 24 ? encodeCursor(offset + 24) : null,
    };
  }
}
