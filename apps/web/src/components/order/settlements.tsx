'use client';

import { SETTLEMENT_STATUS_LABEL as STATUS, formatPrice } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';

/** 판매자 정산: 구매 확정 후 수수료를 뺀 금액이 지급 예정으로 쌓인다 */
export function Settlements() {
  const { data, isPending } = useQuery({ queryKey: ['settlements'], queryFn: api.orders.settlements });
  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            ['지급 예정', data.scheduled],
            ['대기·보류', data.pending],
            ['지급 완료', data.paid],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-sm border border-border p-4">
            <dt className="text-caption text-muted">{label}</dt>
            <dd className="tabular text-h3">{formatPrice(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-muted">
        구매 확정 2일 뒤 등록된 정산 계좌로 지급돼요. 판매 수수료는 작품 금액의 8%이며 배송비에는 붙지 않아요.{' '}
        <Link href="/my/seller" className="underline">
          정산 계좌 관리
        </Link>
      </p>
      {!data.items.length ? (
        <EmptyState title="정산 내역이 없어요" description="구매 확정된 주문부터 정산돼요." />
      ) : (
        <ul className="divide-y divide-border-soft border-y border-border-soft">
          {data.items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/orders/${s.orderId}`} className="block truncate text-body hover:underline">
                  {s.title}
                </Link>
                <p className="tabular text-caption text-muted">
                  {s.orderNumber} · 판매 {formatPrice(s.grossAmount)} − 수수료 {formatPrice(s.feeAmount)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="tabular text-body-strong">{formatPrice(s.netAmount)}</span>
                <Badge
                  tone={s.status === 'PAID' ? 'neutral' : s.status === 'HELD' ? 'destructive' : 'primary'}
                >
                  {STATUS[s.status]} ·{' '}
                  {new Date(s.paidAt ?? s.scheduledAt).toLocaleDateString('ko-KR', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
