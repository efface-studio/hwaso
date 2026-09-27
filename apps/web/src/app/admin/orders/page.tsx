'use client';

import { ORDER_STATUSES, ORDER_STATUS_LABEL, formatPrice, type AdminOrderRow } from '@shop/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AdminList, dt, useAdminAction, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { PromptDialog } from '@/components/admin/prompt-dialog';
import { OrderStatusBadge } from '@/components/order/order-ui';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const REFUNDABLE = [
  'PAYMENT_PENDING',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'REFUND_REQUESTED',
  'COMPLETED',
];

function Orders() {
  const sp = useSearchParams();
  const list = useAdminList<AdminOrderRow>('orders', api.admin.orders, {
    status: sp.get('status') ?? undefined,
  });
  const [target, setTarget] = useState<AdminOrderRow | null>(null);
  const refund = useAdminAction(
    (v: { id: string; r: string }) => api.admin.refund(v.id, v.r),
    '환불(취소) 처리했어요',
    ['orders', 'dashboard'],
  );
  return (
    <>
      <AdminList
        list={list}
        rowKey={(o) => o.id}
        searchPlaceholder="주문번호 · 닉네임 · 작품명"
        filters={[
          {
            key: 'status',
            label: '상태',
            options: ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] })),
          },
        ]}
        columns={[
          {
            key: 'no',
            header: '주문번호',
            cell: (o) => (
              <Link href={`/orders/${o.id}`} target="_blank" className="tabular hover:underline">
                {o.orderNumber}
              </Link>
            ),
          },
          {
            key: 'title',
            header: '작품',
            cell: (o) => <span className="line-clamp-1 max-w-56">{o.title}</span>,
          },
          {
            key: 'parties',
            header: '구매자 → 판매자',
            cell: (o) => `${o.buyer.nickname} → ${o.seller.nickname}`,
          },
          {
            key: 'amount',
            header: '금액',
            cell: (o) => <span className="tabular">{formatPrice(o.totalAmount)}</span>,
          },
          { key: 'status', header: '상태', cell: (o) => <OrderStatusBadge status={o.status} /> },
          { key: 'src', header: '유형', cell: (o) => (o.source === 'AUCTION' ? '낙찰' : '즉시') },
          { key: 'created', header: '주문일', cell: (o) => dt(o.createdAt) },
          {
            key: 'act',
            header: '',
            cell: (o) =>
              REFUNDABLE.includes(o.status) ? (
                <Button size="sm" variant="ghost" onClick={() => setTarget(o)}>
                  {['PAYMENT_PENDING'].includes(o.status) ? '취소' : '환불'}
                </Button>
              ) : null,
          },
        ]}
      />
      {target && (
        <PromptDialog
          open
          onOpenChange={(v) => !v && setTarget(null)}
          title={`${target.orderNumber} 환불·취소`}
          description={
            ['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(target.status)
              ? '배송 이후 분쟁 환불이에요. 결제 금액 전액이 환불되고, 정산은 보류되며 작품은 판매 중지돼요.'
              : '결제 금액 전액이 원래 결제 수단으로 환불돼요.'
          }
          confirmLabel="환불"
          destructive
          pending={refund.isPending}
          onSubmit={(r) => refund.mutate({ id: target.id, r }, { onSuccess: () => setTarget(null) })}
        />
      )}
    </>
  );
}

export default function AdminOrdersPage() {
  return (
    <AdminPage
      title="주문"
      description="주문을 찾아 상세를 보고, 분쟁·예외 상황에서 환불을 처리해요. 발송·배송 처리는 주문 상세에서 할 수 있어요."
    >
      <Suspense>
        <Orders />
      </Suspense>
    </AdminPage>
  );
}
