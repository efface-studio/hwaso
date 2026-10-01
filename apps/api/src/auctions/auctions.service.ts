import { Injectable } from '@nestjs/common';
import type { Auction, Prisma } from '@prisma/client';
import {
  canTransition,
  maskNickname,
  type AuctionListQuery,
  type AuctionSnapshot,
  type AuctionStatus,
  type BidDto,
  type CreateAuctionInput,
  type MyBidDto,
  type ProductListResponse,
  type SellerAuctionDto,
  type UpdateAuctionInput,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/auth';
import { logNotifyError, NotificationEvents } from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import { cardSelect, toCard } from '../products/product.mapper';
import { decodeCursor, encodeCursor, HOME_CACHE_KEY, ProductsService } from '../products/products.service';
import { RealtimeGateway, RealtimeService } from '../realtime/realtime';
import { RedisService } from '../redis/redis.service';
import { SafetyService } from '../safety/safety.controller';
import { toAuctionDto } from './auction.mapper';
import { readAuctionPolicy } from './auction-policy';

const ADMIN = ['ADMIN', 'SUPER_ADMIN'];
const MIN_LEAD_MS = 60_000;

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly gateway: RealtimeGateway,
    private readonly products: ProductsService,
    private readonly events: NotificationEvents,
    private readonly safety: SafetyService,
  ) {}

  private policy() {
    return readAuctionPolicy(this.prisma);
  }

  /** 일정·금액 규칙은 생성과 수정 모두에서 서버가 검증한다 (docs/AUCTION.md §2) */
  private async assertSchedule(
    startsAt: Date,
    endsAt: Date,
    startPrice: bigint,
    buyNow: bigint | null,
    forPublish: boolean,
  ) {
    const p = await this.policy();
    const dur = endsAt.getTime() - startsAt.getTime();
    const problems: string[] = [];
    if (dur < p.minDurationMin * 60_000)
      problems.push(`경매 기간은 최소 ${p.minDurationMin}분 이상이어야 합니다.`);
    if (dur > p.maxDurationDays * 86_400_000) problems.push(`경매 기간은 최대 ${p.maxDurationDays}일입니다.`);
    if (forPublish && startsAt.getTime() < Date.now() + MIN_LEAD_MS)
      problems.push('시작 시간은 지금부터 1분 이후여야 합니다.');
    if (buyNow != null && buyNow <= startPrice) problems.push('즉시 구매가는 시작가보다 높아야 합니다.');
    if (problems.length) throw new AppException('AUCTION_SCHEDULE_INVALID', problems[0], { problems }, 400);
    return p;
  }

  private async ownedProduct(user: AuthUser, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { auction: true },
    });
    if (!product || (product.sellerId !== user.id && !ADMIN.includes(user.role)))
      throw new AppException('NOT_FOUND');
    return product;
  }

  private async owned(user: AuthUser, id: string) {
    const a = await this.prisma.auction.findUnique({ where: { id } });
    if (!a || (a.sellerId !== user.id && !ADMIN.includes(user.role)))
      throw new AppException('NOT_FOUND', '경매를 찾을 수 없습니다.');
    return a;
  }

  async create(user: AuthUser, input: CreateAuctionInput) {
    const product = await this.ownedProduct(user, input.productId);
    if (product.saleType !== 'AUCTION')
      throw new AppException('VALIDATION_FAILED', '경매 판매 방식의 상품만 경매에 등록할 수 있습니다.');
    if (product.status === 'SOLD') throw new AppException('PRODUCT_NOT_EDITABLE', '판매 완료된 상품입니다.');
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const start = BigInt(input.startPrice);
    const buyNow = input.buyNowPrice == null ? null : BigInt(input.buyNowPrice);
    const p = await this.assertSchedule(startsAt, endsAt, start, buyNow, false);

    const data = {
      sellerId: product.sellerId,
      status: 'DRAFT' as const,
      result: 'NONE' as const,
      startPrice: start,
      bidIncrement: BigInt(input.bidIncrement),
      buyNowPrice: buyNow,
      currentPrice: start,
      startsAt,
      endsAt,
      originalEndsAt: endsAt,
      maxEndsAt: new Date(endsAt.getTime() + p.maxExtensionSec * 1000),
      autoExtend: input.autoExtend,
      // 연장 규칙은 판매자가 아니라 관리자 정책 값을 생성 시점에 복사한다
      extensionWindowSec: p.extensionWindowSec,
      extensionSec: p.extensionSec,
      description: input.description,
      highestBidId: null,
      highestBidderId: null,
      bidCount: 0,
      bidderCount: 0,
      winnerId: null,
      endedAt: null,
      cancelReason: null,
      endingSoonNotifiedAt: null,
    };

    // 한 상품에 경매 한 건 — 입찰 없이 끝난(유찰·취소) 경매만 다시 등록할 수 있다
    if (product.auction) {
      const prev = product.auction;
      const relistable =
        prev.bidCount === 0 &&
        (prev.status === 'CANCELLED' || (prev.status === 'ENDED' && prev.result === 'NO_BIDS'));
      if (!relistable) throw new AppException('AUCTION_EXISTS', undefined, undefined, 409);
      const a = await this.prisma.auction.update({
        where: { id: prev.id },
        data: { ...data, version: { increment: 1 } },
      });
      return toAuctionDto(a);
    }
    const a = await this.prisma.auction.create({ data: { ...data, productId: product.id } });
    return toAuctionDto(a);
  }

  async update(user: AuthUser, id: string, input: UpdateAuctionInput) {
    const a = await this.owned(user, id);
    if (a.status !== 'DRAFT' && a.status !== 'SCHEDULED') {
      throw new AppException('INVALID_TRANSITION', '시작된 경매는 수정할 수 없습니다.');
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : a.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : a.endsAt;
    const start = input.startPrice != null ? BigInt(input.startPrice) : a.startPrice;
    const buyNow =
      input.buyNowPrice === undefined
        ? a.buyNowPrice
        : input.buyNowPrice == null
          ? null
          : BigInt(input.buyNowPrice);
    const p = await this.assertSchedule(startsAt, endsAt, start, buyNow, a.status === 'SCHEDULED');
    const updated = await this.prisma.auction.update({
      where: { id, status: a.status },
      data: {
        startPrice: start,
        currentPrice: start,
        bidIncrement: input.bidIncrement != null ? BigInt(input.bidIncrement) : undefined,
        buyNowPrice: buyNow,
        startsAt,
        endsAt,
        originalEndsAt: endsAt,
        maxEndsAt: new Date(endsAt.getTime() + p.maxExtensionSec * 1000),
        autoExtend: input.autoExtend,
        description: input.description,
        version: { increment: 1 },
      },
    });
    await this.prisma.product.update({ where: { id: a.productId }, data: { listPrice: start } });
    return toAuctionDto(updated);
  }

  /** 상태 전이는 항상 조건부 UPDATE — 경쟁 상태에서도 이중 전이가 불가능하다 */
  private async transition(
    id: string,
    from: AuctionStatus,
    to: AuctionStatus,
    data: Prisma.AuctionUpdateInput = {},
  ) {
    if (!canTransition(from, to)) throw new AppException('INVALID_TRANSITION');
    const r = await this.prisma.auction.updateMany({
      where: { id, status: from },
      data: { ...(data as Prisma.AuctionUpdateManyMutationInput), status: to, version: { increment: 1 } },
    });
    if (!r.count) throw new AppException('INVALID_TRANSITION');
    return this.prisma.auction.findUniqueOrThrow({ where: { id } });
  }

  /** 예약(게시) ↔ 예약 취소 */
  async schedule(user: AuthUser, id: string) {
    const a = await this.owned(user, id);
    await this.assertSchedule(a.startsAt, a.endsAt, a.startPrice, a.buyNowPrice, true);
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: a.productId },
      select: { publishedAt: true, status: true, deletedAt: true },
    });
    // 관리자가 숨긴(SUSPENDED)·삭제된 작품은 예약 취소 → 재예약으로 다시 공개하지 못한다
    if (product.status === 'SUSPENDED' || product.deletedAt)
      throw new AppException('PRODUCT_NOT_EDITABLE', '게시가 중지된 작품은 경매를 예약할 수 없습니다.');
    const updated = await this.transition(id, 'DRAFT', 'SCHEDULED');
    await this.prisma.product.update({
      where: { id: a.productId },
      data: { status: 'ACTIVE', publishedAt: product.publishedAt ?? new Date(), listPrice: a.startPrice },
    });
    await this.redis.del(HOME_CACHE_KEY);
    // 최초 게시일 때만 팔로워에게 알린다 (예약 취소 후 재예약은 제외)
    if (!product.publishedAt) void this.events.newProduct(a.productId).catch(logNotifyError);
    return toAuctionDto(updated);
  }

  async unschedule(user: AuthUser, id: string) {
    const a = await this.owned(user, id);
    if (a.startsAt <= new Date())
      throw new AppException('INVALID_TRANSITION', '이미 시작 시간이 지났습니다.');
    const updated = await this.transition(id, 'SCHEDULED', 'DRAFT');
    // 관리자 게시 중지(SUSPENDED)는 유지한다
    await this.prisma.product.updateMany({
      where: { id: a.productId, status: { not: 'SUSPENDED' } },
      data: { status: 'DRAFT' },
    });
    await this.redis.del(HOME_CACHE_KEY);
    return toAuctionDto(updated);
  }

  /**
   * 취소: 판매자는 시작 전(DRAFT/SCHEDULED)만, 관리자는 거래 완료 전 전부 (사유 필수, 감사 로그)
   */
  async cancel(user: AuthUser, id: string, reason: string) {
    const a = await this.owned(user, id);
    const isAdmin = ADMIN.includes(user.role);
    if (!isAdmin && a.status !== 'DRAFT' && a.status !== 'SCHEDULED') {
      throw new AppException(
        'INVALID_TRANSITION',
        '시작된 경매는 취소할 수 없습니다. 고객센터에 문의해주세요.',
      );
    }
    if (isAdmin && !reason.trim() && (a.status === 'LIVE' || a.status === 'ENDED')) {
      throw new AppException('VALIDATION_FAILED', '취소 사유를 입력해주세요.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.auction.updateMany({
        where: { id, status: a.status },
        data: { status: 'CANCELLED', cancelReason: reason || null, version: { increment: 1 } },
      });
      if (!r.count || !canTransition(a.status, 'CANCELLED')) throw new AppException('INVALID_TRANSITION');
      await tx.product.update({ where: { id: a.productId }, data: { status: 'DRAFT' } });
      // 낙찰 후 결제 대기 주문이 있으면 함께 취소
      const orders = await tx.order.findMany({
        where: { auctionId: id, status: { in: ['PENDING', 'PAYMENT_PENDING'] } },
      });
      for (const o of orders) {
        await tx.order.update({
          where: { id: o.id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: '경매 취소' },
        });
        await tx.orderStatusLog.create({
          data: { orderId: o.id, from: o.status, to: 'CANCELLED', actorId: user.id, reason: '경매 취소' },
        });
      }
      if (isAdmin) {
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'auction.cancel',
            targetType: 'Auction',
            targetId: id,
            before: { status: a.status },
            after: { status: 'CANCELLED', reason },
          },
        });
      }
      return tx.auction.findUniqueOrThrow({ where: { id } });
    });
    this.realtime.toAuction(id, 'AUCTION_ENDED', {
      auctionId: id,
      seq: updated.version,
      status: 'CANCELLED',
      result: updated.result,
      winnerId: null,
      finalPrice: Number(updated.currentPrice),
    });
    await this.redis.del(HOME_CACHE_KEY);
    return toAuctionDto(updated);
  }

  async snapshot(id: string, viewer?: AuthUser): Promise<AuctionSnapshot> {
    const a = await this.prisma.auction.findUnique({
      where: { id },
      // 상품은 카드 열만 (설명·반품 정책 등 긴 본문 제외)
      include: { product: { select: { ...cardSelect, deletedAt: true } } },
    });
    const isOwner = viewer && (a?.sellerId === viewer.id || ADMIN.includes(viewer.role));
    if (!a || (a.status === 'DRAFT' && !isOwner) || a.product.deletedAt) {
      throw new AppException('NOT_FOUND', '경매를 찾을 수 없습니다.');
    }
    const [myLast, watchers] = await Promise.all([
      viewer
        ? this.prisma.auctionBid.findFirst({
            where: { auctionId: id, bidderId: viewer.id },
            orderBy: { amount: 'desc' },
          })
        : null,
      this.gateway.watchers(id),
    ]);
    const card = toCard(a.product);
    return {
      auction: toAuctionDto(a),
      product: { id: card.id, title: card.title, artistName: card.artistName, image: card.image },
      serverTime: new Date().toISOString(),
      myLastBid: myLast ? Number(myLast.amount) : null,
      watchers,
    };
  }

  async bids(id: string, viewer?: AuthUser): Promise<BidDto[]> {
    const rows = await this.prisma.auctionBid.findMany({
      where: { auctionId: id, auction: { status: { not: 'DRAFT' } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { bidder: { select: { profile: { select: { nickname: true } } } } },
    });
    return rows.map((b) => ({
      id: b.id,
      amount: Number(b.amount),
      // 입찰자 닉네임은 마스킹해서 공개한다 (docs/AUCTION.md §11)
      bidderMasked: maskNickname(b.bidder.profile?.nickname ?? '익명'),
      isMine: viewer?.id === b.bidderId,
      isBuyNow: b.isBuyNow,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  async list(q: AuctionListQuery, viewer?: AuthUser): Promise<ProductListResponse> {
    const statuses: AuctionStatus[] =
      q.status === 'live' ? ['LIVE'] : q.status === 'scheduled' ? ['SCHEDULED'] : ['ENDED', 'SETTLED'];
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      publishedAt: { not: null },
      auction: { status: { in: statuses } },
      // 내가 차단한 판매자의 경매는 뺀다
      ...(await this.safety.excludeBlocked(viewer?.id, 'sellerId')),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.status === 'ended'
        ? [{ auction: { endedAt: 'desc' } }, { id: 'asc' }]
        : q.sort === 'popular'
          ? [{ auction: { bidCount: 'desc' } }, { id: 'asc' }]
          : q.sort === 'latest'
            ? [{ auction: { startsAt: 'desc' } }, { id: 'asc' }]
            : q.status === 'scheduled'
              ? [{ auction: { startsAt: 'asc' } }, { id: 'asc' }]
              : [{ auction: { endsAt: 'asc' } }, { id: 'asc' }];
    const offset = decodeCursor(q.cursor);
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, select: cardSelect, orderBy, skip: offset, take: q.limit }),
      this.prisma.product.count({ where }),
    ]);
    const favs = await this.products.favoriteSet(
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

  /** 내 입찰 내역 (경매별 요약) · 낙찰 내역 */
  async myBids(user: AuthUser, winsOnly: boolean): Promise<MyBidDto[]> {
    const grouped = await this.prisma.auctionBid.groupBy({
      by: ['auctionId'],
      where: { bidderId: user.id, ...(winsOnly ? { auction: { winnerId: user.id } } : {}) },
      _max: { amount: true, createdAt: true },
      _count: true,
      orderBy: { _max: { createdAt: 'desc' } },
      take: 200,
    });
    if (!grouped.length) return [];
    const auctions = await this.prisma.auction.findMany({
      where: { id: { in: grouped.map((g) => g.auctionId) } },
      include: { product: { select: cardSelect }, order: { select: { id: true } } },
    });
    const byId = new Map(auctions.map((a) => [a.id, a]));
    return grouped
      .map((g) => {
        const a = byId.get(g.auctionId);
        if (!a) return null;
        const card = toCard(a.product);
        return {
          auction: {
            id: a.id,
            status: a.status,
            currentPrice: Number(a.currentPrice),
            bidCount: a.bidCount,
            startsAt: a.startsAt.toISOString(),
            endsAt: a.endsAt.toISOString(),
            highestBidderIsMe: a.highestBidderId === user.id,
            result: a.result,
          },
          product: { id: card.id, title: card.title, artistName: card.artistName, image: card.image },
          myMaxBid: Number(g._max.amount ?? 0),
          myBidCount: g._count,
          lastBidAt: (g._max.createdAt ?? new Date()).toISOString(),
          orderId: a.winnerId === user.id ? (a.order?.id ?? null) : null,
        } satisfies MyBidDto;
      })
      .filter((x): x is MyBidDto => x !== null);
  }

  async sellerAuctions(user: AuthUser): Promise<SellerAuctionDto[]> {
    const rows = await this.prisma.auction.findMany({
      where: { sellerId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { product: { select: cardSelect } },
    });
    return rows.map((a: Auction & { product: Parameters<typeof toCard>[0] }) => {
      const card = toCard(a.product);
      return {
        auction: toAuctionDto(a),
        product: { id: card.id, title: card.title, artistName: card.artistName, image: card.image },
      };
    });
  }
}
