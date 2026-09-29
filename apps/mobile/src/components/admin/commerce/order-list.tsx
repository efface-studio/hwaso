import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  formatPrice,
  type AdminOrderRow,
  type OrderStatus,
} from '@shop/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AdminList, useAdminAction } from '@/components/admin/admin-list';
import { promptReason } from '@/components/admin/prompt';
import { AdminRow } from '@/components/admin/row';
import { StatusText, type StatusTone } from '@/components/admin/status';
import { type SheetOption, actionSheet } from '@/lib/action-sheet';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }));
/** 환불(결제 대기는 취소)할 수 있는 상태 */
const REFUNDABLE: OrderStatus[] = [
  'PAYMENT_PENDING',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'REFUND_REQUESTED',
  'COMPLETED',
];
/** 배송 이후 분쟁 환불 — 정산 보류·작품 운영 정지가 함께 일어난다 */
const AFTER_SHIPPING: OrderStatus[] = ['SHIPPED', 'DELIVERED', 'COMPLETED'];
/** 손이 가야 하는 상태만 색으로 (나머지는 흐린 글자) */
const TONE: Partial<Record<OrderStatus, StatusTone>> = {
  PAYMENT_PENDING: 'warning',
  REFUND_REQUESTED: 'negative',
};

const initialOf = (options: { value: string }[], v: string | undefined) =>
  options.some((o) => o.value === v) ? v : undefined;

/** 주문 한 줄: 작품명과 결제 금액 · 구매자 → 판매자와 주문 경로 · 상태 · 주문번호와 주문일 */
function OrderRow({ o, onPress }: { o: AdminOrderRow; onPress: () => void }) {
  const source = o.source === 'AUCTION' ? '낙찰' : '즉시';
  return (
    <AdminRow
      title={o.title}
      value={formatPrice(o.totalAmount)}
      detail={`${o.buyer.nickname} → ${o.seller.nickname} · ${source}`}
      status={<StatusText label={ORDER_STATUS_LABEL[o.status]} tone={TONE[o.status] ?? 'neutral'} />}
      meta={`${o.orderNumber} · ${dt(o.createdAt)}`}
      accessibilityLabel={`주문 ${o.orderNumber}, ${o.title}, ${formatPrice(o.totalAmount)}, ${ORDER_STATUS_LABEL[o.status]}`}
      accessibilityHint="눌러서 관리 메뉴 열기"
      onPress={onPress}
    />
  );
}

/** 주문: 주문을 찾아 상세를 보고, 분쟁·예외 상황에서 환불(취소)한다 */
export function OrderList({ header, status }: { header: ReactNode; status?: string }) {
  const refund = useAdminAction(api.admin.refund, '환불(취소) 처리했어요', ['orders', 'dashboard']);

  const manage = (o: AdminOrderRow) => {
    const options: SheetOption[] = [
      { label: '주문 보기', onPress: () => router.push({ pathname: '/orders/[id]', params: { id: o.id } }) },
    ];
    if (REFUNDABLE.includes(o.status)) {
      const label = o.status === 'PAYMENT_PENDING' ? '취소' : '환불';
      options.push({
        label,
        destructive: true,
        onPress: async () => {
          const r = await promptReason({
            title: `${o.orderNumber} 환불·취소`,
            description: AFTER_SHIPPING.includes(o.status)
              ? '배송 이후 분쟁 환불이에요. 결제 금액 전액이 환불되고, 정산이 보류되고 작품이 운영 정지돼요.'
              : '결제 금액 전액이 원래 결제 수단으로 환불돼요.',
            confirmLabel: label,
            destructive: true,
          });
          if (r !== null) refund.mutate([o.id, r]);
        },
      });
    }
    actionSheet(o.orderNumber, options);
  };

  return (
    <AdminList
      queryKey="orders"
      fetcher={api.admin.orders}
      header={header}
      searchPlaceholder="주문번호 · 닉네임 · 작품명"
      filters={[
        { key: 'status', label: '상태', options: STATUS_OPTIONS, initial: initialOf(STATUS_OPTIONS, status) },
      ]}
      emptyTitle="주문이 없어요."
      renderItem={(o) => <OrderRow o={o} onPress={() => manage(o)} />}
    />
  );
}
