import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  formatPrice,
  type AdminPaymentRow,
  type PaymentStatus,
} from '@shop/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AdminList } from '@/components/admin/admin-list';
import { AdminRow } from '@/components/admin/row';
import { StatusText, type StatusTone } from '@/components/admin/status';
import { PAYMENT_STATUS_LABEL, dt } from '@/lib/admin';
import { api } from '@/lib/api';

const STATUS_OPTIONS = PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }));
const METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }));

const initialOf = (options: { value: string }[], v: string | undefined) =>
  options.some((o) => o.value === v) ? v : undefined;

/** 눈여겨볼 결제 상태만 표시 (정상 완료는 숨김) */
const TONE: Record<PaymentStatus, StatusTone | null> = {
  DONE: null,
  READY: 'neutral',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
  PARTIAL_REFUNDED: 'warning',
  FAILED: 'negative',
};

/** 결제 한 줄: 주문번호와 결제 금액 · 수단과 환불액·실패 코드 · 상태 · 승인·요청 시각 */
function PaymentRow({ p }: { p: AdminPaymentRow }) {
  const method = `${PAYMENT_METHOD_LABEL[p.method]}${p.provider === 'mock' ? ' (모의)' : ''}`;
  const tone = TONE[p.status];
  const detail = [
    method,
    p.cancelledAmount > 0 ? `환불 ${formatPrice(p.cancelledAmount)}` : null,
    p.failureCode ? `실패 코드 ${p.failureCode}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <AdminRow
      title={p.orderNumber}
      value={formatPrice(p.amount)}
      detail={detail}
      status={tone && <StatusText label={PAYMENT_STATUS_LABEL[p.status]} tone={tone} />}
      meta={p.approvedAt ? `승인 ${dt(p.approvedAt)} · 요청 ${dt(p.createdAt)}` : `요청 ${dt(p.createdAt)}`}
      accessibilityLabel={`주문 ${p.orderNumber}, ${formatPrice(p.amount)}, ${detail}, ${PAYMENT_STATUS_LABEL[p.status]}`}
      accessibilityHint="눌러서 주문 상세 보기"
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: p.orderId } })}
    />
  );
}

/** 결제 (조회 전용): PG 결제 시도·승인·환불 내역. 실패 코드는 토스페이먼츠 오류 코드와 같다 */
export function PaymentList({ header, status }: { header: ReactNode; status?: string }) {
  return (
    <AdminList
      queryKey="payments"
      fetcher={api.admin.payments}
      header={header}
      searchPlaceholder="주문번호 · 결제 ID · paymentKey"
      filters={[
        { key: 'status', label: '상태', options: STATUS_OPTIONS, initial: initialOf(STATUS_OPTIONS, status) },
        { key: 'method', label: '수단', options: METHOD_OPTIONS },
      ]}
      emptyTitle="결제 내역이 없어요."
      renderItem={(p) => <PaymentRow p={p} />}
    />
  );
}
