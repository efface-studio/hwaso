import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { Auction, AuctionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime';
import { logNotifyError, NotificationEvents } from '../notifications/notification-events';
import { RedisService } from '../redis/redis.service';
import { readAuctionPolicy } from './auction-policy';
import { finalizeAuction } from './finalize';
import { invalidateCatalog } from '../products/catalog-cache';

const TICK_MS = 1000;
const BATCH = 50;

/**
 * 경매 시작·종료 워커 (docs/AUCTION.md §7). 1초마다 due 경매를 `FOR UPDATE SKIP LOCKED` 로 집어가므로
 * 워커를 여러 개 띄워도 한 경매는 한 번만 처리된다. 입찰이 잠금을 쥔 경매는 다음 틱에 다시 본다.
 * ponytail: 1초 폴링 — 초당 수만 건 종료가 필요해지면 BullMQ 지연 잡으로 전환 (docs/ARCHITECTURE.md §10)
 */
@Injectable()
export class AuctionScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AuctionScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** 이번 틱에 경매 상태가 바뀌었으면 틱 끝에 홈·목록 집계 캐시를 한 번만 무효화한다 */
  private homeDirty = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    private readonly events: NotificationEvents,
  ) {}

  onApplicationBootstrap() {
    if (process.env.SCHEDULER_ENABLED === 'false' || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log('auction scheduler started');
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 테스트에서 직접 호출할 수 있게 공개 */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.startDue();
      await this.endDue();
      await this.markEndingSoon();
      await this.expireUnpaid();
    } catch (err) {
      this.logger.error({ err }, 'scheduler tick failed');
    } finally {
      if (this.homeDirty) {
        this.homeDirty = false;
        await invalidateCatalog(this.redis).catch((err: unknown) =>
          this.logger.warn({ err }, 'catalog cache invalidation failed'),
        );
      }
      this.running = false;
    }
  }

  private async startDue() {
    // 집어가기(SKIP LOCKED)와 LIVE 전환을 한 문장으로 — 대상이 없으면 트랜잭션 없이 끝난다
    const started = await this.prisma.$queryRaw<{ id: string; version: number; status: AuctionStatus }[]>`
      UPDATE "Auction" SET status = 'LIVE', version = version + 1, "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM "Auction"
        WHERE status = 'SCHEDULED' AND "startsAt" <= now()
        ORDER BY "startsAt" LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      ) AND status = 'SCHEDULED'
      RETURNING id, version, status::text AS status`;
    for (const a of started) {
      this.realtime.toAuction(a.id, 'AUCTION_STARTED', { auctionId: a.id, seq: a.version, status: a.status });
      void this.events.auctionStarted(a.id).catch(logNotifyError);
    }
    if (started.length) this.homeDirty = true;
  }

  private async endDue() {
    // 종료할 경매가 없으면 트랜잭션을 열지 않는다 (유휴 틱 비용)
    const [any] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Auction" WHERE status = 'LIVE' AND "endsAt" <= now() LIMIT 1`;
    if (!any) return;
    // 경매마다 별도 트랜잭션 — 하나가 실패해도 나머지는 종료된다
    for (let i = 0; i < BATCH; i++) {
      const ended = await this.prisma.$transaction(async (tx) => {
        const [due] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Auction"
          WHERE status = 'LIVE' AND "endsAt" <= now()
          ORDER BY "endsAt" LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        if (!due) return null;
        const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
        const now = row!.now;
        return finalizeAuction(tx, due.id, now);
      });
      if (!ended) break;
      this.announceEnd(ended.auction);
      void this.events.auctionEnded(ended.auction.id).catch(logNotifyError);
      this.homeDirty = true;
    }
  }

  private announceEnd(a: Auction) {
    this.realtime.toAuction(a.id, 'AUCTION_ENDED', {
      auctionId: a.id,
      seq: a.version,
      status: a.status,
      result: a.result,
      winnerId: a.winnerId,
      finalPrice: Number(a.currentPrice),
    });
  }

  /** 종료 임박 표시 + 입찰자·관심 사용자 알림 (경매당 한 번) */
  private async markEndingSoon() {
    const minutes = (await readAuctionPolicy(this.prisma)).endingSoonMin;
    // 입찰 트랜잭션이 잠근 경매는 기다리지 않고 다음 틱에 표시한다
    const marked = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Auction" SET "endingSoonNotifiedAt" = now()
      WHERE id IN (
        SELECT id FROM "Auction"
        WHERE status = 'LIVE' AND "endingSoonNotifiedAt" IS NULL
          AND "endsAt" <= now() + make_interval(mins => ${minutes}::int)
        FOR UPDATE SKIP LOCKED
      ) AND status = 'LIVE' AND "endingSoonNotifiedAt" IS NULL
      RETURNING id`;
    for (const { id } of marked) void this.events.auctionEndingSoon(id, minutes).catch(logNotifyError);
  }

  /** 낙찰 후 결제 기한 초과 → 주문 취소, 경매 UNPAID, 낙찰자 미결제 횟수 증가, 상품 재등록 가능 상태로 */
  private async expireUnpaid() {
    const orders = await this.prisma.order.findMany({
      where: { source: 'AUCTION', status: 'PAYMENT_PENDING', paymentDueAt: { lte: new Date() } },
      take: BATCH,
      include: { items: { select: { productId: true } } },
    });
    for (const o of orders) {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.order.updateMany({
          where: { id: o.id, status: 'PAYMENT_PENDING' },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: '결제 기한 초과' },
        });
        if (!r.count) return;
        await tx.orderStatusLog.create({
          data: { orderId: o.id, from: 'PAYMENT_PENDING', to: 'CANCELLED', reason: '결제 기한 초과' },
        });
        if (o.auctionId)
          await tx.auction.update({
            where: { id: o.auctionId },
            data: { result: 'UNPAID', version: { increment: 1 } },
          });
        await tx.user.update({ where: { id: o.buyerId }, data: { unpaidStrikes: { increment: 1 } } });
        await tx.product.updateMany({
          where: { id: { in: o.items.map((i) => i.productId) } },
          data: { status: 'DRAFT' },
        });
      });
    }
  }
}
