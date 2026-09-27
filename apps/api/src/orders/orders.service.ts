import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type OrderStatus, type Product } from '@prisma/client';
import {
  ADMIN_ROLES,
  AUTO_CONFIRM_DAYS,
  AUTO_DELIVER_DAYS,
  DIRECT_PAYMENT_DUE_MIN,
  couponDiscount,
  type CreateOrderInput,
  type OrderDetailDto,
  type OrderListQuery,
  type OrderQuoteDto,
  type OrderRowDto,
  type Page,
  type SettlementSummaryDto,
} from '@shop/shared';
import { newOrderNumber } from '../auctions/auction.mapper';
import type { AuthUser } from '../common/auth';
import { AppException } from '../common/app-exception';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../products/products.service';
import { addressSnapshot } from './cart.service';
import { orderDetailInclude, orderRowInclude, toOrderDetail, toOrderRow } from './order.mapper';
import {
  isUniqueViolation,
  lockOrder,
  markCompleted,
  releaseOrder,
  setStatus,
  type LockedOrder,
} from './order-state';
import { PaymentsService } from './payments.service';

/** PG 최소 결제 금액 — 쿠폰으로 0원이 되지 않게 한다 */
const MIN_PAYMENT = 100;
const BATCH = 50;

const FILTER_STATUSES: Record<OrderListQuery['filter'], OrderStatus[] | undefined> = {
  all: undefined,
  pending: ['PAYMENT_PENDING'],
  progress: ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'REFUND_REQUESTED'],
  done: ['COMPLETED', 'REFUNDED'],
  cancelled: ['CANCELLED'],
};

type Role = 'buyer' | 'seller' | 'admin';
interface Line {
  product: Product & { images: { key: string; width: number; height: number; dominantColor: string }[] };
  quantity: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  // ───── 금액 계산 · 주문 생성 ─────

  /** 상품·수량 검증과 금액 계산. 주문 생성 시에는 상품 행을 잠근 트랜잭션 안에서 다시 호출한다 */
  private async price(db: Tx, userId: string, items: CreateOrderInput['items'], couponCode?: string) {
    const qty = new Map<string, number>();
    for (const i of items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);
    const products = await db.product.findMany({
      where: { id: { in: [...qty.keys()] } },
      include: {
        images: {
          select: { key: true, width: true, height: true, dominantColor: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
      },
    });
    if (products.length !== qty.size) throw new AppException('NOT_FOUND');
    const lines: Line[] = products.map((product) => ({ product, quantity: qty.get(product.id)! }));
    for (const { product: p, quantity } of lines) {
      const onSale =
        !p.deletedAt && p.publishedAt && p.status === 'ACTIVE' && p.saleType !== 'AUCTION' && p.price != null;
      if (!onSale) throw new AppException('NOT_FOR_SALE', undefined, { productId: p.id }, 409);
      if (p.sellerId === userId) throw new AppException('SELF_PURCHASE', undefined, undefined, 403);
      if (p.stock < quantity)
        throw new AppException('OUT_OF_STOCK', undefined, { productId: p.id, stock: p.stock });
    }
    const sellers = new Set(lines.map((l) => l.product.sellerId));
    if (sellers.size > 1) throw new AppException('MULTI_SELLER_ORDER');

    const itemsAmount = lines.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0);
    // 작품은 한 점씩 따로 포장·운송하므로 배송비는 상품별 합산
    const shippingFee = lines.reduce((s, l) => s + Number(l.product.shippingFee), 0);
    const coupon = couponCode ? await this.coupon(db, userId, couponCode, itemsAmount) : null;
    const discountAmount = coupon
      ? Math.min(
          couponDiscount(
            {
              type: coupon.type,
              value: Number(coupon.value),
              maxDiscount: coupon.maxDiscount == null ? null : Number(coupon.maxDiscount),
            },
            itemsAmount,
          ),
          Math.max(0, itemsAmount + shippingFee - MIN_PAYMENT),
        )
      : 0;
    return {
      lines,
      sellerId: [...sellers][0]!,
      itemsAmount,
      shippingFee,
      discountAmount,
      totalAmount: itemsAmount + shippingFee - discountAmount,
      coupon,
    };
  }

  private async coupon(db: Tx, userId: string, code: string, itemsAmount: number) {
    const now = new Date();
    const c = await db.coupon.findUnique({ where: { code } });
    const exhausted = c?.usageLimit != null && c.usedCount >= c.usageLimit;
    if (!c || !c.isActive || c.startsAt > now || c.endsAt < now || exhausted)
      throw new AppException('COUPON_INVALID');
    if (itemsAmount < Number(c.minOrderAmount))
      throw new AppException('COUPON_MIN_AMOUNT', undefined, { minOrderAmount: Number(c.minOrderAmount) });
    if (await db.couponRedemption.findUnique({ where: { couponId_userId: { couponId: c.id, userId } } }))
      throw new AppException('COUPON_ALREADY_USED', undefined, undefined, 409);
    return c;
  }

  private async assertBuyer(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, emailVerifiedAt: true },
    });
    if (u.status !== 'ACTIVE') throw new AppException('ACCOUNT_RESTRICTED');
    if (!u.emailVerifiedAt) throw new AppException('EMAIL_NOT_VERIFIED');
  }

  async quote(
    user: AuthUser,
    input: { items: CreateOrderInput['items']; couponCode?: string },
  ): Promise<OrderQuoteDto> {
    const q = await this.price(this.prisma, user.id, input.items, input.couponCode);
    return {
      items: q.lines.map(({ product: p, quantity }) => ({
        productId: p.id,
        title: p.title,
        image: p.images[0] ?? null,
        unitPrice: Number(p.price),
        quantity,
      })),
      itemsAmount: q.itemsAmount,
      shippingFee: q.shippingFee,
      discountAmount: q.discountAmount,
      totalAmount: q.totalAmount,
      coupon: q.coupon && { code: q.coupon.code, name: q.coupon.name },
    };
  }

  /** 즉시 구매 주문 생성: 상품 잠금 → 재검증 → 재고 예약 → 결제 대기 (docs/API.md) */
  async create(user: AuthUser, input: CreateOrderInput) {
    await this.assertBuyer(user.id);
    const address = await this.prisma.address.findFirst({ where: { id: input.addressId, userId: user.id } });
    if (!address) throw new AppException('ADDRESS_REQUIRED');
    const ids = [...new Set(input.items.map((i) => i.productId))].sort();
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
        const q = await this.price(tx, user.id, input.items, input.couponCode);
        if (q.coupon) {
          const used = await tx.$executeRaw`
            UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
            WHERE id = ${q.coupon.id} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
          if (!used) throw new AppException('COUPON_INVALID');
        }
        const now = new Date();
        const order = await tx.order.create({
          data: {
            orderNumber: newOrderNumber(now),
            buyerId: user.id,
            sellerId: q.sellerId,
            source: 'DIRECT',
            status: 'PAYMENT_PENDING',
            itemsAmount: BigInt(q.itemsAmount),
            shippingFee: BigInt(q.shippingFee),
            discountAmount: BigInt(q.discountAmount),
            totalAmount: BigInt(q.totalAmount),
            couponId: q.coupon?.id,
            paymentDueAt: new Date(now.getTime() + DIRECT_PAYMENT_DUE_MIN * 60_000),
            shippingAddress: addressSnapshot(address) as object,
            items: {
              create: q.lines.map(({ product: p, quantity }) => ({
                productId: p.id,
                titleSnapshot: p.title,
                imageKeySnapshot: p.images[0]?.key,
                unitPrice: p.price!,
                quantity,
              })),
            },
            statusLogs: {
              create: { from: null, to: 'PAYMENT_PENDING', actorId: user.id, reason: '주문 생성' },
            },
          },
        });
        if (q.coupon)
          await tx.couponRedemption.create({
            data: { couponId: q.coupon.id, userId: user.id, orderId: order.id },
          });
        for (const { product: p, quantity } of q.lines)
          await tx.product.update({
            where: { id: p.id },
            data: {
              stock: { decrement: quantity },
              ...(p.stock === quantity ? { status: 'RESERVED' as const } : {}),
            },
          });
        if (input.fromCart)
          await tx.cartItem.deleteMany({ where: { userId: user.id, productId: { in: ids } } });
        return order;
      });
      return { id: order.id, orderNumber: order.orderNumber, totalAmount: Number(order.totalAmount) };
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppException('COUPON_ALREADY_USED', undefined, undefined, 409);
      throw e;
    }
  }

  // ───── 조회 ─────

  async list(
    user: AuthUser,
    as: 'buyer' | 'seller',
    q: OrderListQuery,
  ): Promise<Page<OrderRowDto> & { total: number }> {
    const statuses = FILTER_STATUSES[q.filter];
    const where: Prisma.OrderWhereInput = {
      ...(as === 'buyer' ? { buyerId: user.id } : { sellerId: user.id }),
      ...(statuses ? { status: { in: statuses } } : {}),
    };
    const offset = decodeCursor(q.cursor);
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderRowInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: q.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    const next = offset + rows.length;
    return {
      items: rows.map((o) => toOrderRow(o, user.id)),
      nextCursor: next < total ? encodeCursor(next) : null,
      total,
    };
  }

  /** 마이페이지·판매 관리 상태별 건수 */
  async summary(user: AuthUser, as: 'buyer' | 'seller') {
    const groups = await this.prisma.order.groupBy({
      by: ['status'],
      where: as === 'buyer' ? { buyerId: user.id } : { sellerId: user.id },
      _count: true,
    });
    const count = (s: OrderStatus) => groups.find((g) => g.status === s)?._count ?? 0;
    return {
      pending: count('PAYMENT_PENDING'),
      paid: count('PAID') + count('PREPARING'),
      shipping: count('SHIPPED'),
      delivered: count('DELIVERED'),
      refundRequested: count('REFUND_REQUESTED'),
    };
  }

  async detail(user: AuthUser, id: string): Promise<OrderDetailDto> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    const admin = ADMIN_ROLES.includes(user.role);
    if (!o || (o.buyerId !== user.id && o.sellerId !== user.id && !admin))
      throw new AppException('NOT_FOUND');
    return toOrderDetail(o, { id: user.id, admin });
  }

  // ───── 상태 변경 ─────

  private roleOf(user: AuthUser, o: { buyerId: string; sellerId: string }): Role {
    if (o.buyerId === user.id) return 'buyer';
    if (o.sellerId === user.id) return 'seller';
    if (ADMIN_ROLES.includes(user.role)) return 'admin';
    throw new AppException('NOT_FOUND');
  }

  /** 잠금 → 권한 → 변경 → 알림 */
  private async act(
    user: AuthUser,
    id: string,
    who: Role[],
    fn: (tx: Tx, o: LockedOrder, role: Role) => Promise<unknown>,
  ) {
    const order = await this.prisma.$transaction(async (tx) => {
      const o = await lockOrder(tx, id);
      const role = this.roleOf(user, o);
      if (!who.includes(role)) throw new AppException('FORBIDDEN');
      await fn(tx, o, role);
      return o;
    });
    this.payments.notify(order);
    return this.detail(user, id);
  }

  prepare(user: AuthUser, id: string) {
    return this.act(user, id, ['seller', 'admin'], (tx, o) =>
      setStatus(tx, o, 'PREPARING', { actorId: user.id, reason: '발송 준비' }),
    );
  }

  ship(user: AuthUser, id: string, input: { carrier: string; trackingNumber: string }) {
    return this.act(user, id, ['seller', 'admin'], async (tx, o) => {
      if (o.status === 'PAID') await setStatus(tx, o, 'PREPARING', { actorId: user.id, reason: '발송 준비' });
      await setStatus(tx, o, 'SHIPPED', {
        actorId: user.id,
        reason: `${input.carrier} ${input.trackingNumber}`,
      });
      const data = { ...input, status: 'SHIPPED' as const, shippedAt: new Date() };
      await tx.shipment.upsert({
        where: { orderId: o.id },
        create: { orderId: o.id, ...data },
        update: data,
      });
    });
  }

  /** 송장 정정 (배송 중일 때만) */
  updateShipment(user: AuthUser, id: string, input: { carrier: string; trackingNumber: string }) {
    return this.act(user, id, ['seller', 'admin'], async (tx, o) => {
      if (o.status !== 'SHIPPED') throw new AppException('INVALID_TRANSITION');
      await tx.shipment.update({ where: { orderId: o.id }, data: input });
      await tx.orderStatusLog.create({
        data: {
          orderId: o.id,
          from: 'SHIPPED',
          to: 'SHIPPED',
          actorId: user.id,
          reason: `송장 정정: ${input.carrier} ${input.trackingNumber}`,
        },
      });
    });
  }

  deliver(user: AuthUser, id: string) {
    return this.act(user, id, ['seller', 'admin'], async (tx, o) => {
      const now = new Date();
      await setStatus(tx, o, 'DELIVERED', {
        actorId: user.id,
        reason: '배송 완료',
        data: { deliveredAt: now },
      });
      await tx.shipment.updateMany({
        where: { orderId: o.id },
        data: { status: 'DELIVERED', deliveredAt: now },
      });
    });
  }

  /** 구매 확정 (배송 중이면 수령 확인을 함께 처리) */
  confirm(user: AuthUser, id: string) {
    return this.act(user, id, ['buyer'], async (tx, o) => {
      if (o.status !== 'SHIPPED' && o.status !== 'DELIVERED') throw new AppException('INVALID_TRANSITION');
      await markCompleted(tx, o, user.id, '구매 확정');
    });
  }

  refundRequest(user: AuthUser, id: string, reason: string) {
    return this.act(user, id, ['buyer'], (tx, o) =>
      setStatus(tx, o, 'REFUND_REQUESTED', { actorId: user.id, reason }),
    );
  }

  /** 환불 거절: 배송 완료로 되돌리고 자동 확정 기간을 다시 센다 */
  refundReject(user: AuthUser, id: string, reason: string) {
    return this.act(user, id, ['seller', 'admin'], (tx, o) =>
      setStatus(tx, o, 'DELIVERED', {
        actorId: user.id,
        reason: `환불 거절: ${reason}`,
        data: { deliveredAt: new Date() },
      }),
    );
  }

  /** 환불 승인: PG 환불(멱등) 후 상태 반영. 반품된 작품은 판매자가 확인하도록 판매 중지로 */
  async refundApprove(user: AuthUser, id: string) {
    const o = await this.readForUpdate(user, id, ['seller', 'admin'], ['REFUND_REQUESTED']);
    await this.payments.refundPayment(o, '환불 승인');
    return this.act(user, id, ['seller', 'admin'], async (tx, locked) => {
      await setStatus(tx, locked, 'REFUNDED', { actorId: user.id, reason: '환불 승인' });
      await releaseOrder(tx, locked, 'return');
    });
  }

  /**
   * 주문 취소. 결제 전: 구매자·관리자(즉시 구매는 판매자도) / 결제 후 발송 전: 판매자·관리자(즉시 구매는 결제 직후 구매자도).
   * 결제된 주문은 PG 환불을 먼저 하고 상태를 바꾼다.
   * ponytail: 환불과 발송이 같은 순간 겹치면 환불 후 전이가 거절될 수 있다 — 에러 로그로 남겨 운영자가 처리
   */
  async cancel(user: AuthUser, id: string, reason: string) {
    const o = await this.readForUpdate(
      user,
      id,
      ['buyer', 'seller', 'admin'],
      ['PAYMENT_PENDING', 'PAID', 'PREPARING'],
    );
    const role = this.roleOf(user, o);
    const direct = o.source === 'DIRECT';
    const allowed: Partial<Record<OrderStatus, Role[]>> = {
      PAYMENT_PENDING: direct ? ['buyer', 'seller', 'admin'] : ['buyer', 'admin'],
      PAID: direct ? ['buyer', 'seller', 'admin'] : ['seller', 'admin'],
      PREPARING: ['seller', 'admin'],
    };
    if (!allowed[o.status]?.includes(role)) throw new AppException('FORBIDDEN');
    await this.payments.refundPayment(o, reason);
    try {
      return await this.act(user, id, [role], (tx, locked) =>
        this.cancelTx(tx, locked, user.id, role, reason),
      );
    } catch (e) {
      if (o.status !== 'PAYMENT_PENDING')
        this.logger.error({ err: e, orderId: id }, 'refunded but cancel failed');
      throw e;
    }
  }

  private async cancelTx(
    tx: Tx,
    o: LockedOrder,
    actorId: string | null,
    role: Role | 'system',
    reason: string,
  ) {
    const wasUnpaid = o.status === 'PAYMENT_PENDING';
    await setStatus(tx, o, 'CANCELLED', {
      actorId,
      reason,
      data: { cancelledAt: new Date(), cancelReason: reason },
    });
    await releaseOrder(tx, o, 'cancel');
    // 낙찰 후 결제하지 않고 취소하면 기한 초과와 똑같이 미결제로 기록한다
    if (wasUnpaid && o.auctionId && (role === 'buyer' || role === 'system')) {
      await tx.auction.update({
        where: { id: o.auctionId },
        data: { result: 'UNPAID', version: { increment: 1 } },
      });
      await tx.user.update({ where: { id: o.buyerId }, data: { unpaidStrikes: { increment: 1 } } });
    }
  }

  private readForUpdate(user: AuthUser, id: string, who: Role[], statuses: OrderStatus[]) {
    return this.prisma.$transaction(async (tx) => {
      const o = await lockOrder(tx, id);
      if (!who.includes(this.roleOf(user, o))) throw new AppException('FORBIDDEN');
      if (!statuses.includes(o.status)) throw new AppException('INVALID_TRANSITION');
      return o;
    });
  }

  // ───── 워커 ─────

  /** 결제 기한이 지난 즉시 구매 주문 취소 (낙찰 주문은 경매 워커가 처리) */
  async expireDue() {
    const due = await this.prisma.order.findMany({
      where: { source: 'DIRECT', status: 'PAYMENT_PENDING', paymentDueAt: { lte: new Date() } },
      select: { id: true },
      take: BATCH,
    });
    for (const { id } of due) {
      const o = await this.prisma.$transaction(async (tx) => {
        const o = await lockOrder(tx, id);
        if (o.status !== 'PAYMENT_PENDING' || !o.paymentDueAt || o.paymentDueAt > new Date()) return null;
        await this.cancelTx(tx, o, null, 'system', '결제 기한 초과');
        return o;
      });
      if (!o) continue;
      await this.payments
        .refundPayment(o, '결제 기한 초과')
        .catch((err: unknown) => this.logger.warn({ err, orderId: id }, 'void after expiry failed'));
      this.payments.notify(o);
    }
  }

  /** 발송 후 오래 지난 주문은 배송 완료로, 배송 완료 후 7일 지난 주문은 구매 확정으로 */
  async autoAdvance() {
    const now = Date.now();
    const shipped = await this.prisma.order.findMany({
      where: {
        status: 'SHIPPED',
        shipment: { shippedAt: { lte: new Date(now - AUTO_DELIVER_DAYS * 86_400_000) } },
      },
      select: { id: true },
      take: BATCH,
    });
    for (const { id } of shipped)
      await this.advance(id, 'SHIPPED', async (tx, o) => {
        const at = new Date();
        await setStatus(tx, o, 'DELIVERED', { reason: '배송 완료 (자동)', data: { deliveredAt: at } });
        await tx.shipment.updateMany({
          where: { orderId: o.id },
          data: { status: 'DELIVERED', deliveredAt: at },
        });
      });

    const delivered = await this.prisma.order.findMany({
      where: { status: 'DELIVERED', deliveredAt: { lte: new Date(now - AUTO_CONFIRM_DAYS * 86_400_000) } },
      select: { id: true },
      take: BATCH,
    });
    for (const { id } of delivered)
      await this.advance(id, 'DELIVERED', (tx, o) => markCompleted(tx, o, null, '구매 확정 (자동)'));
  }

  private async advance(id: string, expect: OrderStatus, fn: (tx: Tx, o: LockedOrder) => Promise<unknown>) {
    const o = await this.prisma.$transaction(async (tx) => {
      const o = await lockOrder(tx, id);
      if (o.status !== expect) return null;
      await fn(tx, o);
      return o;
    });
    if (o) this.payments.notify(o);
  }

  // ───── 정산 ─────

  async settlements(user: AuthUser): Promise<SettlementSummaryDto> {
    const [rows, sums] = await Promise.all([
      this.prisma.settlement.findMany({
        where: { sellerId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          order: { select: { orderNumber: true, items: { select: { titleSnapshot: true }, take: 1 } } },
        },
      }),
      this.prisma.settlement.groupBy({
        by: ['status'],
        where: { sellerId: user.id },
        _sum: { netAmount: true },
      }),
    ]);
    const sum = (s: string) => Number(sums.find((g) => g.status === s)?._sum.netAmount ?? 0);
    return {
      pending: sum('PENDING') + sum('HELD'),
      scheduled: sum('SCHEDULED'),
      paid: sum('PAID'),
      items: rows.map((s) => ({
        id: s.id,
        orderId: s.orderId,
        orderNumber: s.order.orderNumber,
        title: s.order.items[0]?.titleSnapshot ?? '',
        grossAmount: Number(s.grossAmount),
        feeAmount: Number(s.feeAmount),
        netAmount: Number(s.netAmount),
        status: s.status,
        scheduledAt: s.scheduledAt.toISOString(),
        paidAt: s.paidAt?.toISOString() ?? null,
      })),
    };
  }
}
