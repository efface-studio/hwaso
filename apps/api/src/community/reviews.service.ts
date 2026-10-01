import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  REVIEW_EDIT_DAYS,
  type CreateReviewInput,
  type ImageDto,
  type ReviewDto,
  type ReviewSummaryDto,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/auth';
import { NotificationsService } from '../notifications/notifications.service';
import { isUniqueViolation } from '../orders/order-state';
import { toUserSummary } from '../orders/order.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { mediaOwnerKey } from '../products/seller-products.service';
import { RedisService } from '../redis/redis.service';

const include = {
  author: { select: { id: true, profile: { select: { nickname: true, avatarKey: true } } } },
  order: { select: { items: { select: { titleSnapshot: true }, take: 1 } } },
} satisfies Prisma.ReviewInclude;
type Row = Prisma.ReviewGetPayload<{ include: typeof include }>;

const editable = (r: { createdAt: Date }) =>
  Date.now() - r.createdAt.getTime() < REVIEW_EDIT_DAYS * 86_400_000;

/** 거래 후기: 구매 확정된 주문의 구매자·판매자가 서로 한 번씩. 평점은 받은 후기로 다시 계산한다 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  private async images(userId: string, keys: string[], existing: ImageDto[] = []): Promise<ImageDto[]> {
    const keep = new Map(existing.map((i) => [i.key, i]));
    return Promise.all(
      keys.map(async (key) => {
        if (keep.has(key)) return keep.get(key)!;
        const [owner, meta] = await Promise.all([
          this.redis.get(mediaOwnerKey(key)),
          this.redis.get(`media:meta:${key}`),
        ]);
        if (owner !== userId || !meta)
          throw new AppException('INVALID_IMAGE', '업로드한 사진만 첨부할 수 있습니다.');
        const m = JSON.parse(meta) as ImageDto;
        return { key, width: m.width, height: m.height, dominantColor: m.dominantColor };
      }),
    );
  }

  private toDto(r: Row, viewerId?: string): ReviewDto {
    return {
      id: r.id,
      orderId: r.orderId,
      direction: r.direction,
      rating: r.rating,
      comment: r.comment,
      images: (r.imageMeta ?? []) as unknown as ImageDto[],
      author: toUserSummary(r.author),
      productTitle: r.order.items[0]?.titleSnapshot ?? '',
      createdAt: r.createdAt.toISOString(),
      editable: r.authorId === viewerId && editable(r),
    };
  }

  private async recalc(userId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { targetUserId: userId, deletedAt: null },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.profile.updateMany({
      where: { userId },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
    });
  }

  async create(user: AuthUser, orderId: string, input: CreateReviewInput) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: { take: 1 } } });
    if (!o || (o.buyerId !== user.id && o.sellerId !== user.id)) throw new AppException('NOT_FOUND');
    if (o.status !== 'COMPLETED')
      throw new AppException('INVALID_TRANSITION', '구매 확정된 거래만 후기를 남길 수 있습니다.');
    const buyer = o.buyerId === user.id;
    const images = await this.images(user.id, input.imageKeys);
    try {
      const r = await this.prisma.review.create({
        data: {
          orderId,
          authorId: user.id,
          targetUserId: buyer ? o.sellerId : o.buyerId,
          direction: buyer ? 'BUYER_TO_SELLER' : 'SELLER_TO_BUYER',
          rating: input.rating,
          comment: input.comment,
          imageKeys: images.map((i) => i.key),
          imageMeta: images as object[],
        },
      });
      await this.recalc(r.targetUserId);
      const me = await this.notifications.senderOf(user.id);
      await this.notifications.notify(r.targetUserId, {
        type: 'REVIEW_RECEIVED',
        sender: me,
        title: `${me?.name ?? '거래 상대'}님이 후기를 남겼어요`,
        body: `${'★'.repeat(input.rating)} ${input.comment.slice(0, 50)}`,
        link: `/users/${r.targetUserId}?tab=reviews`,
      });
      return { id: r.id };
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppException('CONFLICT', '이미 이 거래의 후기를 남겼어요.');
      throw e;
    }
  }

  private async own(user: AuthUser, id: string) {
    const r = await this.prisma.review.findFirst({ where: { id, authorId: user.id, deletedAt: null } });
    if (!r) throw new AppException('NOT_FOUND');
    return r;
  }

  async update(user: AuthUser, id: string, input: CreateReviewInput) {
    const r = await this.own(user, id);
    if (!editable(r))
      throw new AppException(
        'INVALID_TRANSITION',
        `후기는 작성 후 ${REVIEW_EDIT_DAYS}일 안에만 수정할 수 있어요.`,
      );
    const images = await this.images(user.id, input.imageKeys, (r.imageMeta ?? []) as unknown as ImageDto[]);
    await this.prisma.review.update({
      where: { id },
      data: {
        rating: input.rating,
        comment: input.comment,
        imageKeys: images.map((i) => i.key),
        imageMeta: images as object[],
      },
    });
    await this.recalc(r.targetUserId);
    return { id };
  }

  async remove(user: AuthUser, id: string) {
    const r = await this.own(user, id);
    await this.prisma.review.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.recalc(r.targetUserId);
    return { ok: true };
  }

  /** 주문 상세에서 내 후기 확인·수정용 */
  async mine(user: AuthUser, orderId: string): Promise<ReviewDto | null> {
    const r = await this.prisma.review.findFirst({
      where: { orderId, authorId: user.id, deletedAt: null },
      include,
    });
    return r && this.toDto(r, user.id);
  }

  async received(userId: string, cursor: string | undefined, viewerId?: string) {
    const PAGE = 20;
    const rows = await this.prisma.review.findMany({
      where: { targetUserId: userId, deletedAt: null },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE);
    return {
      items: page.map((r) => this.toDto(r, viewerId)),
      nextCursor: rows.length > PAGE ? page.at(-1)!.id : null,
    };
  }

  async summary(userId: string): Promise<ReviewSummaryDto> {
    const groups = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { targetUserId: userId, deletedAt: null },
      _count: true,
    });
    const distribution = [1, 2, 3, 4, 5].map(
      (n) => groups.find((g) => g.rating === n)?._count ?? 0,
    ) as ReviewSummaryDto['distribution'];
    const count = distribution.reduce((a, b) => a + b, 0);
    const avg = count ? distribution.reduce((s, c, i) => s + c * (i + 1), 0) / count : 0;
    return { ratingAvg: Math.round(avg * 10) / 10, ratingCount: count, distribution };
  }
}
