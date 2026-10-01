import { Injectable } from '@nestjs/common';
import type { AdminDashboardDto } from '@shop/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const PAID = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'REFUND_REQUESTED'] as const;
const DAY = 86_400_000;
const CACHE_KEY = 'admin:dashboard';
const CACHE_TTL_SEC = 30;

/** 한국 시간 자정 (지표의 "오늘" 기준) */
function kstMidnight(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3_600_000);
}

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 지표는 30초 캐시한다 (여러 관리자가 열어 두어도 집계는 30초에 한 번) */
  async get(): Promise<AdminDashboardDto> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as AdminDashboardDto;
    const dto = await this.compute();
    await this.redis.set(CACHE_KEY, JSON.stringify(dto), 'EX', CACHE_TTL_SEC);
    return dto;
  }

  private async compute(): Promise<AdminDashboardDto> {
    const p = this.prisma;
    const today = kstMidnight();
    const tomorrow = new Date(today.getTime() + DAY);
    const since30 = new Date(today.getTime() - 29 * DAY);
    const since14 = new Date(today.getTime() - 13 * DAY);
    const sum = (v: { _sum: { totalAmount: bigint | null } }) => Number(v._sum.totalAmount ?? 0);

    const [
      usersTotal,
      usersToday,
      suspended,
      sellersTotal,
      sellersPending,
      productsActive,
      certPending,
      live,
      scheduled,
      endingToday,
      ordersToday,
      gmvToday,
      gmv30,
      paymentPending,
      toShip,
      refunds,
      reports,
      unpaid,
      scheduledAmt,
      heldAmt,
      series,
    ] = await Promise.all([
      p.user.count({ where: { status: { not: 'DELETED' } } }),
      p.user.count({ where: { createdAt: { gte: today } } }),
      p.user.count({ where: { status: 'SUSPENDED' } }),
      p.seller.count(),
      p.seller.count({ where: { verifiedAt: null } }),
      p.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      p.certificate.count({ where: { verificationStatus: 'PENDING' } }),
      p.auction.count({ where: { status: 'LIVE' } }),
      p.auction.count({ where: { status: 'SCHEDULED' } }),
      p.auction.count({ where: { status: 'LIVE', endsAt: { lt: tomorrow } } }),
      p.order.count({ where: { createdAt: { gte: today }, status: { in: [...PAID] } } }),
      p.order.aggregate({ where: { paidAt: { gte: today } }, _sum: { totalAmount: true } }),
      p.order.aggregate({
        where: { paidAt: { gte: since30 }, status: { in: [...PAID] } },
        _sum: { totalAmount: true },
      }),
      p.order.count({ where: { status: 'PAYMENT_PENDING' } }),
      p.order.count({ where: { status: { in: ['PAID', 'PREPARING'] } } }),
      p.order.count({ where: { status: 'REFUND_REQUESTED' } }),
      p.report.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      p.auction.count({ where: { result: 'UNPAID', updatedAt: { gte: since30 } } }),
      p.settlement.aggregate({ where: { status: 'SCHEDULED' }, _sum: { netAmount: true } }),
      p.settlement.aggregate({ where: { status: 'HELD' }, _sum: { netAmount: true } }),
      // 14일 추이: 표마다 한국 시간 날짜로 한 번씩 GROUP BY (Asia/Seoul 은 서머타임이 없어 kstMidnight 와 경계가 같다)
      p.$queryRaw<{ d: string; signups: bigint; orders: bigint; gmv: bigint }[]>`
        WITH days AS (
          SELECT generate_series(${since14}::timestamptz, ${today}::timestamptz, interval '1 day') AS start
        ),
        s AS (
          SELECT date_trunc('day', u."createdAt" AT TIME ZONE 'Asia/Seoul') AS day, count(*) AS signups
          FROM "User" u
          WHERE u."createdAt" >= ${since14}::timestamptz AND u."createdAt" < ${tomorrow}::timestamptz
          GROUP BY 1
        ),
        o AS (
          SELECT date_trunc('day', o."paidAt" AT TIME ZONE 'Asia/Seoul') AS day,
            count(*) AS orders, coalesce(sum(o."totalAmount"), 0) AS gmv
          FROM "Order" o
          WHERE o."paidAt" >= ${since14}::timestamptz AND o."paidAt" < ${tomorrow}::timestamptz
          GROUP BY 1
        )
        SELECT to_char(d.start AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS d,
          coalesce(s.signups, 0) AS signups, coalesce(o.orders, 0) AS orders, coalesce(o.gmv, 0) AS gmv
        FROM days d
        LEFT JOIN s ON s.day = d.start AT TIME ZONE 'Asia/Seoul'
        LEFT JOIN o ON o.day = d.start AT TIME ZONE 'Asia/Seoul'
        ORDER BY d.start`,
    ]);

    return {
      users: { total: usersTotal, today: usersToday, suspended },
      sellers: { total: sellersTotal, pendingVerification: sellersPending },
      products: { active: productsActive, pendingCertificates: certPending },
      auctions: { live, scheduled, endingToday },
      orders: { today: ordersToday, gmvToday: sum(gmvToday), gmv30d: sum(gmv30), paymentPending, toShip },
      issues: { refundRequests: refunds, openReports: reports, unpaidAuctions: unpaid },
      settlements: {
        scheduledAmount: Number(scheduledAmt._sum.netAmount ?? 0),
        heldAmount: Number(heldAmt._sum.netAmount ?? 0),
      },
      series: series.map((r) => ({
        date: r.d,
        signups: Number(r.signups),
        orders: Number(r.orders),
        gmv: Number(r.gmv),
      })),
    };
  }
}
