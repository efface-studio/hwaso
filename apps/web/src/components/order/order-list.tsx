'use client';

import { ORDER_LIST_FILTERS, formatPrice, type OrderListQuery } from '@shop/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { OrderItemRow, OrderStatusBadge } from './order-ui';

const LABEL: Record<OrderListQuery['filter'], string> = {
  all: '전체',
  pending: '결제 대기',
  progress: '진행 중',
  done: '완료',
  cancelled: '취소',
};

/** 구매 내역 · 판매 주문 공용 목록 */
export function OrderList({
  as,
  initialFilter = 'all',
}: {
  as: 'buyer' | 'seller';
  initialFilter?: OrderListQuery['filter'];
}) {
  const [filter, setFilter] = useState(initialFilter);
  const q = useInfiniteQuery({
    queryKey: ['orders', as, filter],
    queryFn: ({ pageParam }) =>
      (as === 'buyer' ? api.orders.list : api.orders.sellerOrders)({ filter, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="주문 상태">
        {ORDER_LIST_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'h-9 shrink-0 rounded-sm border px-3 text-label',
              filter === f ? 'border-foreground bg-foreground text-background' : 'border-border',
            )}
          >
            {LABEL[f]}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : !rows.length ? (
        <EmptyState
          icon={<Receipt />}
          title={as === 'buyer' ? '주문 내역이 없어요' : '받은 주문이 없어요'}
          action={
            as === 'buyer' ? (
              <Button asChild variant="outline">
                <Link href="/search">작품 둘러보기</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o) => (
            <li key={o.id} className="rounded-sm border border-border">
              <Link href={`/orders/${o.id}`} className="flex flex-col gap-3 p-4 hover:bg-background-soft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    <span className="tabular text-caption text-muted">
                      {new Date(o.createdAt).toLocaleDateString('ko-KR')} · {o.orderNumber}
                    </span>
                  </div>
                  <span className="text-small text-muted">
                    {as === 'buyer' ? '판매자' : '구매자'} {o.counterpart.nickname}
                  </span>
                </div>
                <OrderItemRow item={o.items[0]!} compact />
                <div className="flex items-center justify-between text-small">
                  <span className="text-muted">{o.items.length > 1 ? `외 ${o.items.length - 1}건` : ''}</span>
                  <span className="tabular text-body-strong">{formatPrice(o.totalAmount)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          더 보기
        </Button>
      )}
    </div>
  );
}
