import { Injectable } from '@nestjs/common';
import { Prisma, type Auction, type AuctionBid } from '@prisma/client';
import { checkBidAmount, extendedEndsAt, maskNickname, minNextBid } from '@shop/shared';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/auth';
import { IdentityService } from '../identity/identity.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime';
import { finalizeAuction } from './finalize';

/** 이 금액 이상 입찰은 본인인증 필요 (본인인증이 설정된 환경) */
export const HIGH_VALUE_BID = 10_000_000;
/** 낙찰 후 미결제가 이 횟수에 이르면 입찰 제한 */
export const UNPAID_STRIKE_LIMIT = 2;

type BidOutcome = {
  auction: Auction;
  bid: AuctionBid;
  extendedBySec: number;
  previousHighestBidderId: string | null;
  duplicate: boolean;
  ended: boolean;
  orderId: string | null;
};

const n = (v: bigint) => Number(v);

/**
 * 입찰 (docs/AUCTION.md §4). 한 경매의 입찰은 행 잠금(FOR UPDATE)으로 완전히 직렬화된다.
 * 클라이언트가 보낸 값은 금액·멱등 키뿐이며 현재가·상태·종료 시간은 모두 잠금 후 DB 에서 다시 읽는다.
 */
@Injectable()
export class BiddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly identity: IdentityService,
  ) {}

  private async assertBidder(user: AuthUser, amount: number) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerifiedAt: true, unpaidStrikes: true, status: true },
    });
    if (u.status !== 'ACTIVE') throw new AppException('ACCOUNT_RESTRICTED');
    if (!u.emailVerifiedAt) throw new AppException('EMAIL_NOT_VERIFIED');
    if (u.unpaidStrikes >= UNPAID_STRIKE_LIMIT) {
      throw new AppException(
        'ACCOUNT_RESTRICTED',
        '낙찰 후 미결제 이력으로 입찰이 제한되었습니다. 고객센터에 문의해주세요.',
      );
    }
    if (amount >= HIGH_VALUE_BID) {
      try {
        await this.identity.assertVerified(user.id);
      } catch {
        throw new AppException('HIGH_VALUE_IDENTITY_REQUIRED', undefined, undefined, 403);
      }
    }
  }

  /** 잠금 + DB 시각. lock_timeout 을 넘기면 재시도 안내 (AUCTION_BUSY) */
  private async lock(tx: Tx, auctionId: string): Promise<{ a: Auction; now: Date }> {
    await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
    const rows = await tx.$queryRaw<Auction[]>`SELECT * FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
    const a = rows[0];
    if (!a) throw new AppException('NOT_FOUND', '경매를 찾을 수 없습니다.');
    const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    const now = row!.now;
    return { a, now };
  }

  private assertLive(a: Auction, now: Date, userId: string) {
    if (a.status === 'ENDED' || a.status === 'SETTLED' || (a.status === 'LIVE' && a.endsAt <= now)) {
      throw new AppException('AUCTION_ENDED');
    }
    if (a.status !== 'LIVE') throw new AppException('AUCTION_NOT_LIVE');
    if (a.sellerId === userId) throw new AppException('SELF_BID');
  }

  async placeBid(user: AuthUser, auctionId: string, amount: number, idempotencyKey: string) {
    await this.assertBidder(user, amount);
    const outcome = await this.run(user.id, idempotencyKey, async (tx) => {
      const { a, now } = await this.lock(tx, auctionId);
      // 같은 멱등 키 요청이 동시에 잠금을 기다렸다면 먼저 처리된 결과를 돌려준다
      const dup = await this.duplicateIn(tx, user.id, idempotencyKey);
      if (dup) return dup;
      this.assertLive(a, now, user.id);
      if (a.highestBidderId === user.id) throw new AppException('ALREADY_HIGHEST');

      const state = {
        startPrice: n(a.startPrice),
        bidIncrement: n(a.bidIncrement),
        currentPrice: n(a.currentPrice),
        bidCount: a.bidCount,
        buyNowPrice: a.buyNowPrice == null ? null : n(a.buyNowPrice),
      };
      const check = checkBidAmount(state, amount);
      if (!check.ok) {
        const min = minNextBid(state);
        const message =
          check.code === 'BID_TOO_LOW'
            ? `최소 입찰가는 ${min.toLocaleString('ko-KR')}원입니다.`
            : check.code === 'BID_NOT_ALIGNED'
              ? `${state.bidIncrement.toLocaleString('ko-KR')}원 단위로 입찰해주세요.`
              : undefined;
        throw new AppException(check.code, message, check.details, 400);
      }

      const bid = await tx.auctionBid.create({
        data: { auctionId, bidderId: user.id, amount: BigInt(amount), idempotencyKey },
      });
      const firstBidFromUser = (await tx.auctionBid.count({ where: { auctionId, bidderId: user.id } })) === 1;
      const nextEnd = extendedEndsAt(a, now);
      const updated = await tx.auction.update({
        where: { id: auctionId },
        data: {
          currentPrice: BigInt(amount),
          highestBidId: bid.id,
          highestBidderId: user.id,
          bidCount: { increment: 1 },
          bidderCount: firstBidFromUser ? { increment: 1 } : undefined,
          endsAt: nextEnd ?? undefined,
          version: { increment: 1 },
        },
      });
      await tx.product.update({ where: { id: a.productId }, data: { listPrice: BigInt(amount) } });
      return {
        auction: updated,
        bid,
        extendedBySec: nextEnd ? Math.round((nextEnd.getTime() - a.endsAt.getTime()) / 1000) : 0,
        previousHighestBidderId: a.highestBidderId,
        duplicate: false,
        ended: false,
        orderId: null,
      };
    });
    await this.publish(outcome, user.id);
    return this.response(outcome);
  }

  /** 즉시 구매: 입찰과 같은 잠금 경로에서 입찰 기록 후 같은 트랜잭션에서 종료한다 (docs/AUCTION.md §6) */
  async buyNow(user: AuthUser, auctionId: string, idempotencyKey: string) {
    const preview = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { buyNowPrice: true },
    });
    if (!preview?.buyNowPrice) throw new AppException('BUY_NOW_UNAVAILABLE');
    await this.assertBidder(user, n(preview.buyNowPrice));
    const outcome = await this.run(user.id, idempotencyKey, async (tx) => {
      const { a, now } = await this.lock(tx, auctionId);
      const dup = await this.duplicateIn(tx, user.id, idempotencyKey);
      if (dup) return dup;
      this.assertLive(a, now, user.id);
      if (a.buyNowPrice == null || a.currentPrice >= a.buyNowPrice)
        throw new AppException('BUY_NOW_UNAVAILABLE');
      const bid = await tx.auctionBid.create({
        data: { auctionId, bidderId: user.id, amount: a.buyNowPrice, idempotencyKey, isBuyNow: true },
      });
      const firstBidFromUser = (await tx.auctionBid.count({ where: { auctionId, bidderId: user.id } })) === 1;
      await tx.auction.update({
        where: { id: auctionId },
        data: {
          currentPrice: a.buyNowPrice,
          highestBidId: bid.id,
          highestBidderId: user.id,
          bidCount: { increment: 1 },
          bidderCount: firstBidFromUser ? { increment: 1 } : undefined,
          endsAt: now,
        },
      });
      const fin = await finalizeAuction(tx, auctionId, now);
      return {
        auction: fin.auction,
        bid,
        extendedBySec: 0,
        previousHighestBidderId: a.highestBidderId,
        duplicate: false,
        ended: true,
        orderId: fin.orderId,
      };
    });
    await this.publish(outcome, user.id);
    return this.response(outcome);
  }

  /**
   * 트랜잭션 실행 + 멱등 처리. 같은 (사용자, 멱등 키) 는 이전 결과를 그대로 돌려준다.
   * 동시에 같은 키가 두 번 와도 유니크 제약이 한 건만 남긴다.
   */
  private async run(
    userId: string,
    idempotencyKey: string,
    fn: (tx: Tx) => Promise<BidOutcome>,
  ): Promise<BidOutcome> {
    const existing = await this.previous(userId, idempotencyKey);
    if (existing) return existing;
    try {
      return await this.prisma.$transaction(fn, { timeout: 10_000, maxWait: 5_000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
        if (target.includes('idempotencyKey')) {
          const again = await this.previous(userId, idempotencyKey);
          if (again) return again;
        }
        // 같은 금액 동시 입찰 — 잠금 순서상 거의 없지만 방어
        throw new AppException(
          'BID_TOO_LOW',
          '다른 입찰이 먼저 반영되었습니다. 금액을 다시 확인해주세요.',
          undefined,
          409,
        );
      }
      if (isLockTimeout(e)) throw new AppException('AUCTION_BUSY');
      throw e;
    }
  }

  private async previous(userId: string, idempotencyKey: string): Promise<BidOutcome | null> {
    return this.duplicateIn(this.prisma, userId, idempotencyKey);
  }

  private async duplicateIn(db: Tx, userId: string, idempotencyKey: string): Promise<BidOutcome | null> {
    const bid = await db.auctionBid.findUnique({
      where: { bidderId_idempotencyKey: { bidderId: userId, idempotencyKey } },
      include: { auction: true },
    });
    if (!bid) return null;
    return {
      auction: bid.auction,
      bid,
      extendedBySec: 0,
      previousHighestBidderId: null,
      duplicate: true,
      ended: bid.auction.status === 'ENDED',
      orderId: null,
    };
  }

  /** 커밋 이후에만 방송한다 — 롤백된 입찰이 알려지는 일이 없다 */
  private async publish(o: BidOutcome, bidderId: string) {
    if (o.duplicate) return;
    const a = o.auction;
    const nickname =
      (await this.prisma.profile.findUnique({ where: { userId: bidderId }, select: { nickname: true } }))
        ?.nickname ?? '';
    const bidder = maskNickname(nickname);
    this.realtime.toAuction(a.id, 'AUCTION_BID', {
      auctionId: a.id,
      seq: a.version,
      bid: {
        id: o.bid.id,
        amount: n(o.bid.amount),
        bidderMasked: bidder,
        bidderId,
        isBuyNow: o.bid.isBuyNow,
        createdAt: o.bid.createdAt.toISOString(),
      },
    });
    this.realtime.toAuction(a.id, 'AUCTION_PRICE_UPDATED', {
      auctionId: a.id,
      seq: a.version,
      currentPrice: n(a.currentPrice),
      minNextBid: minNextBid({
        startPrice: n(a.startPrice),
        bidIncrement: n(a.bidIncrement),
        currentPrice: n(a.currentPrice),
        bidCount: a.bidCount,
      }),
      bidCount: a.bidCount,
      bidderCount: a.bidderCount,
      highestBidderId: a.highestBidderId,
    });
    if (o.extendedBySec > 0) {
      this.realtime.toAuction(a.id, 'AUCTION_EXTENDED', {
        auctionId: a.id,
        seq: a.version,
        endsAt: a.endsAt.toISOString(),
        extendedBySec: o.extendedBySec,
      });
      this.realtime.toAuction(a.id, 'AUCTION_TIMER_UPDATED', {
        auctionId: a.id,
        seq: a.version,
        endsAt: a.endsAt.toISOString(),
        serverTime: new Date().toISOString(),
      });
    }
    if (o.ended) {
      this.realtime.toAuction(a.id, 'AUCTION_ENDED', {
        auctionId: a.id,
        seq: a.version,
        status: a.status,
        result: a.result,
        winnerId: a.winnerId,
        finalPrice: n(a.currentPrice),
      });
    }
  }

  private response(o: BidOutcome) {
    const a = o.auction;
    return {
      bidId: o.bid.id,
      amount: n(o.bid.amount),
      currentPrice: n(a.currentPrice),
      endsAt: a.endsAt.toISOString(),
      extended: o.extendedBySec > 0,
      ended: o.ended,
      orderId: o.orderId,
      seq: a.version,
    };
  }
}

function isLockTimeout(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String(e);
  return text.includes('55P03') || text.includes('lock timeout');
}
