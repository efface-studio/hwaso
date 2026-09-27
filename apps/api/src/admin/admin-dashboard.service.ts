import { Injectable } from '@nestjs/common';
import type { AdminDashboardDto } from '@shop/shared';
import { PrismaService } from '../prisma/prisma.service';

const PAID = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'REFUND_REQUESTED'] as const;
const DAY = 86_400_000;

/** 한국 시간 자정 (지표의 "오늘" 기준) */
function kstMidnight(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3_600_000);
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AdminDashboardDto> {
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
      p.$queryRaw<{ d: string; signups: bigint; orders: bigint; gmv: bigint }[]>`
        WITH days AS (
          SELECT generate_series(${since14}::timestamptz, ${today}::timestamptz, interval '1 day') AS start
        )
        SELECT to_char(d.start AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS d,
          (SELECT count(*) FROM "User" u WHERE u."createdAt" >= d.start AND u."createdAt" < d.start + interval '1 day') AS signups,
          (SELECT count(*) FROM "Order" o WHERE o."paidAt" >= d.start AND o."paidAt" < d.start + interval '1 day') AS orders,
          (SELECT coalesce(sum(o."totalAmount"), 0) FROM "Order" o WHERE o."paidAt" >= d.start AND o."paidAt" < d.start + interval '1 day') AS gmv
        FROM days d ORDER BY d.start`,
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
