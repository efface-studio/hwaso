import { Injectable, Logger } from '@nestjs/common';
import type { OrderStatus, NotificationType } from '@prisma/client';
import { formatPrice } from '@shop/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from './notifications.service';

type OrderLike = {
  id: string;
  status: OrderStatus;
  buyerId: string;
  sellerId: string;
  items: { titleSnapshot: string }[];
};

type Msg = { to: 'buyer' | 'seller' | 'both'; type: NotificationType; title: string; body?: string };

/** 주문 상태별 알림 문구 (받는 사람 기준) */
const ORDER_MESSAGES: Partial<Record<OrderStatus, Msg[]>> = {
  PAID: [
    { to: 'buyer', type: 'PAYMENT_DONE', title: '결제가 완료되었어요' },
    { to: 'seller', type: 'ITEM_SOLD', title: '작품이 판매되었어요', body: '발송을 준비해주세요.' },
  ],
  PREPARING: [{ to: 'buyer', type: 'ORDER_UPDATED', title: '판매자가 발송을 준비하고 있어요' }],
  SHIPPED: [
    {
      to: 'buyer',
      type: 'SHIPPED',
      title: '작품이 발송되었어요',
      body: '배송 조회로 위치를 확인할 수 있어요.',
    },
  ],
  DELIVERED: [
    {
      to: 'buyer',
      type: 'DELIVERED',
      title: '배송이 완료되었어요',
      body: '작품을 확인하고 구매를 확정해주세요.',
    },
  ],
  COMPLETED: [
    { to: 'seller', type: 'ORDER_UPDATED', title: '구매가 확정되었어요', body: '정산이 예정되었어요.' },
  ],
  CANCELLED: [{ to: 'both', type: 'ORDER_UPDATED', title: '주문이 취소되었어요' }],
  REFUND_REQUESTED: [
    {
      to: 'seller',
      type: 'ORDER_UPDATED',
      title: '환불 요청이 들어왔어요',
      body: '요청 사유를 확인해주세요.',
    },
  ],
  REFUNDED: [{ to: 'buyer', type: 'ORDER_UPDATED', title: '환불이 완료되었어요' }],
};

const logger = new Logger('NotificationEvents');
/** 알림 이벤트는 응답을 기다리지 않고 보낸다 — 실패는 로그로만 남긴다 */
export const logNotifyError = (err: unknown) => logger.warn({ err }, 'notification event failed');

/** 도메인 이벤트 → 알림. 호출하는 쪽은 커밋 이후에 부른다 */
@Injectable()
export class NotificationEvents {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  private auction(id: string) {
    return this.prisma.auction.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        result: true,
        winnerId: true,
        currentPrice: true,
        productId: true,
        product: { select: { title: true } },
        order: { select: { id: true } },
      },
    });
  }

  private async bidderIds(auctionId: string) {
    const rows = await this.prisma.auctionBid.findMany({
      where: { auctionId },
      distinct: ['bidderId'],
      select: { bidderId: true },
    });
    return rows.map((r) => r.bidderId);
  }

  private async favoriterIds(productId: string) {
    const rows = await this.prisma.favorite.findMany({ where: { productId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async bidPlaced(auctionId: string, bidderId: string, previousHighestId: string | null, amount: number) {
    const a = await this.auction(auctionId);
    if (!a) return;
    const body = `${a.product.title} · 현재가 ${formatPrice(amount)}`;
    const link = `/auctions/${a.id}`;
    if (previousHighestId && previousHighestId !== bidderId)
      await this.n.notify(previousHighestId, {
        type: 'OUTBID',
        title: '더 높은 입찰이 들어왔어요',
        body,
        link,
      });
    await this.n.notify(a.sellerId, { type: 'BID_PLACED', title: '새 입찰이 들어왔어요', body, link });
  }

  async auctionEnded(auctionId: string) {
    const a = await this.auction(auctionId);
    if (!a) return;
    const price = formatPrice(Number(a.currentPrice));
    if (a.result === 'SOLD' && a.winnerId && a.order) {
      const orderLink = `/orders/${a.order.id}`;
      await this.n.notify(a.winnerId, {
        type: 'AUCTION_WON',
        title: '낙찰되었어요',
        body: `${a.product.title} · ${price} · 결제 기한 안에 결제해주세요.`,
        link: orderLink,
      });
      const losers = (await this.bidderIds(a.id)).filter((id) => id !== a.winnerId);
      await this.n.notify(losers, {
        type: 'AUCTION_LOST',
        title: '경매가 종료되었어요',
        body: `${a.product.title} · 최종 ${price}에 다른 분이 낙찰받았어요.`,
        link: `/auctions/${a.id}`,
      });
      await this.n.notify(a.sellerId, {
        type: 'ITEM_SOLD',
        title: '작품이 낙찰되었어요',
        body: `${a.product.title} · ${price} · 구매자의 결제를 기다리고 있어요.`,
        link: orderLink,
      });
      return;
    }
    await this.n.notify(a.sellerId, {
      type: 'SYSTEM',
      title: '유찰되었어요',
      body: `${a.product.title} · 입찰 없이 경매가 끝났어요. 조건을 바꿔 다시 등록할 수 있어요.`,
      link: '/seller',
    });
  }

  async auctionStarted(auctionId: string) {
    const a = await this.auction(auctionId);
    if (!a) return;
    await this.n.notify(await this.favoriterIds(a.productId), {
      type: 'AUCTION_STARTED',
      title: '관심 작품의 경매가 시작되었어요',
      body: a.product.title,
      link: `/auctions/${a.id}`,
    });
  }

  async auctionEndingSoon(auctionId: string, minutes: number) {
    const a = await this.auction(auctionId);
    if (!a) return;
    const ids = [...(await this.bidderIds(a.id)), ...(await this.favoriterIds(a.productId))];
    await this.n.notify(ids, {
      type: 'AUCTION_ENDING',
      title: `경매가 ${minutes}분 안에 종료돼요`,
      body: `${a.product.title} · 현재가 ${formatPrice(Number(a.currentPrice))}`,
      link: `/auctions/${a.id}`,
    });
  }

  async orderChanged(o: OrderLike) {
    const msgs = ORDER_MESSAGES[o.status];
    if (!msgs) return;
    const first = o.items[0]?.titleSnapshot ?? '';
    const title = o.items.length > 1 ? `${first} 외 ${o.items.length - 1}건` : first;
    for (const m of msgs) {
      const to = m.to === 'both' ? [o.buyerId, o.sellerId] : m.to === 'buyer' ? o.buyerId : o.sellerId;
      await this.n.notify(to, {
        type: m.type,
        title: m.title,
        body: m.body ? `${title} · ${m.body}` : title,
        link: `/orders/${o.id}`,
      });
    }
  }

  async inquiryReceived(inquiryId: string) {
    const q = await this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { question: true, product: { select: { id: true, title: true, sellerId: true } } },
    });
    if (!q) return;
    await this.n.notify(q.product.sellerId, {
      type: 'INQUIRY_RECEIVED',
      title: '새 상품 문의가 있어요',
      body: `${q.product.title} · ${q.question.slice(0, 60)}`,
      link: `/products/${q.product.id}#inquiries`,
    });
  }

  async inquiryAnswered(inquiryId: string) {
    const q = await this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { userId: true, product: { select: { id: true, title: true } } },
    });
    if (!q) return;
    await this.n.notify(q.userId, {
      type: 'INQUIRY_ANSWERED',
      title: '문의에 답변이 달렸어요',
      body: q.product.title,
      link: `/products/${q.product.id}#inquiries`,
    });
  }

  async priceDropped(productId: string, oldPrice: number, newPrice: number) {
    if (newPrice >= oldPrice) return;
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { title: true, sellerId: true },
    });
    if (!p) return;
    const ids = (await this.favoriterIds(productId)).filter((id) => id !== p.sellerId);
    await this.n.notify(ids, {
      type: 'PRICE_CHANGED',
      title: '관심 작품 가격이 내려갔어요',
      body: `${p.title} · ${formatPrice(oldPrice)} → ${formatPrice(newPrice)}`,
      link: `/products/${productId}`,
    });
  }

  /** 새 작품 최초 게시 → 팔로워 알림 */
  async newProduct(productId: string) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        title: true,
        sellerId: true,
        seller: { select: { profile: { select: { nickname: true } } } },
      },
    });
    if (!p) return;
    const followers = await this.prisma.follow.findMany({
      where: { followingId: p.sellerId },
      select: { followerId: true },
    });
    await this.n.notify(
      followers.map((f) => f.followerId),
      {
        type: 'FOLLOWING_NEW_ITEM',
        title: `${p.seller.profile?.nickname ?? '팔로우한 판매자'}님의 새 작품`,
        body: p.title,
        link: `/products/${productId}`,
      },
    );
  }

  /**
   * 가입 축하 (이메일 가입 직후 · 소셜 가입 마무리 직후). 회원마다 한 번만 —
   * 이미 받은 회원은 건너뛰고, 동시에 두 번 불려도(동의 연타) 잠금으로 한 번만 보낸다
   */
  async welcome(userId: string) {
    const locked = await this.redis.set(`notify:welcome:${userId}`, '1', 'EX', 60, 'NX');
    if (!locked) return;
    const sent = await this.prisma.notification.count({ where: { userId, type: 'WELCOME' } });
    if (sent) return;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { nickname: true } } },
    });
    if (!u) return;
    await this.n.notify(userId, {
      type: 'WELCOME',
      title: '화소에 오신 걸 환영해요',
      body: `${u.profile?.nickname ?? '회원'}님, 가입을 축하해요. 마음에 드는 작품을 찾아보고 관심 작품에 담아 보세요.`,
      link: '/',
    });
  }
}
