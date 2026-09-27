import type { Prisma } from '@prisma/client';
import {
  AUTO_CONFIRM_DAYS,
  trackingUrl,
  type OrderDetailDto,
  type OrderItemDto,
  type OrderRowDto,
  type PaymentDto,
  type ShippingAddress,
  type UserSummary,
} from '@shop/shared';
import { BANK_NAMES, type TossPayment } from './toss.client';

const userSelect = { id: true, profile: { select: { nickname: true, avatarKey: true } } } as const;
const itemInclude = {
  product: {
    select: {
      images: {
        select: { key: true, width: true, height: true, dominantColor: true },
        orderBy: { sortOrder: 'asc' },
        take: 1,
      },
    },
  },
} as const;

export const orderRowInclude = {
  items: { include: itemInclude },
  buyer: { select: userSelect },
  seller: { select: userSelect },
} satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  ...orderRowInclude,
  payments: { orderBy: { createdAt: 'desc' } },
  shipment: true,
  statusLogs: { orderBy: { createdAt: 'asc' } },
  reviews: { select: { authorId: true } },
} satisfies Prisma.OrderInclude;

type RowOrder = Prisma.OrderGetPayload<{ include: typeof orderRowInclude }>;
type DetailOrder = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;
type UserRow = RowOrder['buyer'];

export const toUserSummary = (u: UserRow): UserSummary => ({
  id: u.id,
  nickname: u.profile?.nickname ?? '탈퇴한 회원',
  avatarKey: u.profile?.avatarKey ?? null,
});

const toItem = (i: RowOrder['items'][number]): OrderItemDto => ({
  productId: i.productId,
  title: i.titleSnapshot,
  image: i.product.images[0] ?? null,
  unitPrice: Number(i.unitPrice),
  quantity: i.quantity,
});

export function toOrderRow(o: RowOrder, viewerId: string): OrderRowDto {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    source: o.source,
    status: o.status,
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt.toISOString(),
    paymentDueAt: o.paymentDueAt?.toISOString() ?? null,
    items: o.items.map(toItem),
    counterpart: toUserSummary(o.buyerId === viewerId ? o.seller : o.buyer),
  };
}

function toPayment(p: DetailOrder['payments'][number] | undefined): PaymentDto | null {
  if (!p) return null;
  const raw = p.raw as Partial<TossPayment> | null;
  const va = raw?.virtualAccount;
  return {
    id: p.id,
    provider: p.provider,
    method: p.method,
    status: p.status,
    amount: Number(p.amount),
    cancelledAmount: Number(p.cancelledAmount),
    approvedAt: p.approvedAt?.toISOString() ?? null,
    virtualAccount:
      va && p.status === 'READY'
        ? {
            bank: BANK_NAMES[va.bankCode] ?? va.bankCode,
            accountNumber: va.accountNumber,
            holder: va.customerName,
            dueDate: va.dueDate,
          }
        : null,
    receiptUrl: raw?.receipt?.url ?? null,
  };
}

export function toOrderDetail(o: DetailOrder, viewer: { id: string; admin: boolean }): OrderDetailDto {
  // 표시할 결제: 완료·환불된 결제 → 입금 대기 가상계좌 → 가장 최근 시도
  const payment =
    o.payments.find((p) => p.status !== 'READY' && p.status !== 'FAILED') ??
    o.payments.find((p) => p.status === 'READY' && p.providerPaymentKey) ??
    o.payments[0];
  const refundLog = [...o.statusLogs].reverse().find((l) => l.to === 'REFUND_REQUESTED');
  const s = o.shipment;
  return {
    ...toOrderRow(o, viewer.id),
    buyer: toUserSummary(o.buyer),
    seller: toUserSummary(o.seller),
    role: o.buyerId === viewer.id ? 'buyer' : o.sellerId === viewer.id ? 'seller' : 'admin',
    itemsAmount: Number(o.itemsAmount),
    shippingFee: Number(o.shippingFee),
    discountAmount: Number(o.discountAmount),
    shippingAddress: o.shippingAddress as ShippingAddress | null,
    auctionId: o.auctionId,
    paidAt: o.paidAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancelReason: o.cancelReason,
    refundReason: refundLog?.reason ?? null,
    payment: toPayment(payment),
    shipment: s && {
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      trackingUrl: trackingUrl(s.carrier, s.trackingNumber),
      status: s.status,
      shippedAt: s.shippedAt?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
    },
    logs: o.statusLogs.map((l) => ({
      from: l.from,
      to: l.to,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    })),
    autoConfirmAt:
      o.status === 'DELIVERED' && o.deliveredAt
        ? new Date(o.deliveredAt.getTime() + AUTO_CONFIRM_DAYS * 86_400_000).toISOString()
        : null,
    reviewed: o.reviews.some((r) => r.authorId === viewer.id),
  };
}
