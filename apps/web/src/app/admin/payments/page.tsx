'use client';

import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  formatPrice,
  type AdminPaymentRow,
} from '@shop/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminList, dt, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Badge } from '@/components/ui/display';
import { api } from '@/lib/api';

const STATUS: Record<string, string> = {
  READY: '대기',
  DONE: '완료',
  CANCELLED: '취소',
  PARTIAL_REFUNDED: '부분 환불',
  REFUNDED: '환불',
  FAILED: '실패',
};

function Payments() {
  const list = useAdminList<AdminPaymentRow>('payments', api.admin.payments);
  return (
    <AdminList
      list={list}
      rowKey={(p) => p.id}
      searchPlaceholder="주문번호 · 결제 ID · paymentKey"
      filters={[
        {
          key: 'status',
          label: '상태',
          options: PAYMENT_STATUSES.map((s) => ({ value: s, label: STATUS[s] ?? s })),
        },
        {
          key: 'method',
          label: '수단',
          options: PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] })),
        },
      ]}
      columns={[
        {
          key: 'order',
          header: '주문',
          cell: (p) => (
            <Link href={`/orders/${p.orderId}`} target="_blank" className="tabular hover:underline">
              {p.orderNumber}
            </Link>
          ),
        },
        {
          key: 'method',
          header: '수단',
          cell: (p) => `${PAYMENT_METHOD_LABEL[p.method]}${p.provider === 'mock' ? ' (모의)' : ''}`,
        },
        {
          key: 'amount',
          header: '금액',
          cell: (p) => (
            <span className="tabular">
              {formatPrice(p.amount)}
              {p.cancelledAmount > 0 && (
                <span className="block text-caption text-destructive">
                  환불 {formatPrice(p.cancelledAmount)}
                </span>
              )}
            </span>
          ),
        },
        {
          key: 'status',
          header: '상태',
          cell: (p) => (
            <Badge tone={p.status === 'DONE' ? 'primary' : p.status === 'FAILED' ? 'destructive' : 'neutral'}>
              {STATUS[p.status]}
            </Badge>
          ),
        },
        { key: 'fail', header: '실패 코드', cell: (p) => p.failureCode ?? '-' },
        { key: 'approved', header: '승인', cell: (p) => dt(p.approvedAt) },
        { key: 'created', header: '요청', cell: (p) => dt(p.createdAt) },
      ]}
    />
  );
}

export default function AdminPaymentsPage() {
  return (
    <AdminPage
      title="결제"
      description="PG 결제 시도·승인·환불 내역이에요. 실패 코드는 토스페이먼츠 오류 코드와 같아요."
    >
      <Suspense>
        <Payments />
      </Suspense>
    </AdminPage>
  );
}
