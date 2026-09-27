'use client';

import { SETTLEMENT_STATUSES, formatPrice, type AdminSettlementRow } from '@shop/shared';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { AdminList, dt, useAdminAction, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { api } from '@/lib/api';

const STATUS = { PENDING: '대기', SCHEDULED: '지급 예정', PAID: '지급 완료', HELD: '보류' } as const;
const TONE = { PENDING: 'outline', SCHEDULED: 'primary', PAID: 'neutral', HELD: 'destructive' } as const;

function Settlements() {
  const list = useAdminList<AdminSettlementRow>('settlements', api.admin.settlements, {
    status: 'SCHEDULED',
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const run = useAdminAction(
    (v: { ids: string[]; action: 'pay' | 'hold' | 'release' }) => api.admin.settlementAction(v.ids, v.action),
    '정산 상태를 바꿨어요',
    ['settlements', 'dashboard'],
  );
  const rows = list.query.data?.items ?? [];
  const selected = rows.filter((r) => picked.has(r.id));
  const total = selected.reduce((s, r) => s + r.netAmount, 0);
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const act = (action: 'pay' | 'hold' | 'release') => {
    const label = { pay: '지급 완료로 처리', hold: '보류', release: '보류 해제' }[action];
    if (!confirm(`${selected.length}건 (${formatPrice(total)})을 ${label}할까요?`)) return;
    run.mutate({ ids: selected.map((r) => r.id), action }, { onSuccess: () => setPicked(new Set()) });
  };
  return (
    <AdminList
      list={list}
      rowKey={(s) => s.id}
      searchPlaceholder="주문번호 · 판매자"
      filters={[
        {
          key: 'status',
          label: '상태',
          options: SETTLEMENT_STATUSES.map((s) => ({ value: s, label: STATUS[s] })),
        },
      ]}
      toolbar={
        selected.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-small">
              {selected.length}건 · {formatPrice(total)}
            </span>
            <Button size="sm" loading={run.isPending} onClick={() => act('pay')}>
              지급 완료
            </Button>
            <Button size="sm" variant="outline" onClick={() => act('hold')}>
              보류
            </Button>
            <Button size="sm" variant="outline" onClick={() => act('release')}>
              보류 해제
            </Button>
          </div>
        )
      }
      columns={[
        {
          key: 'pick',
          header: (
            <input
              type="checkbox"
              aria-label="이 페이지 모두 선택"
              checked={rows.length > 0 && selected.length === rows.length}
              onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
            />
          ),
          cell: (s) => (
            <input
              type="checkbox"
              aria-label={`${s.orderNumber} 선택`}
              checked={picked.has(s.id)}
              onChange={() => toggle(s.id)}
            />
          ),
          className: 'w-10',
        },
        {
          key: 'order',
          header: '주문',
          cell: (s) => (
            <Link href={`/orders/${s.orderId}`} target="_blank" className="tabular hover:underline">
              {s.orderNumber}
            </Link>
          ),
        },
        {
          key: 'seller',
          header: '판매자 · 계좌',
          cell: (s) => (
            <span className="flex flex-col">
              <span>{s.seller.nickname}</span>
              <span className="text-caption text-muted">{s.bank ?? '계좌 없음'}</span>
            </span>
          ),
        },
        {
          key: 'amount',
          header: '판매 − 수수료 = 지급',
          cell: (s) => (
            <span className="tabular">
              {formatPrice(s.grossAmount)} − {formatPrice(s.feeAmount)} ={' '}
              <strong>{formatPrice(s.netAmount)}</strong>
            </span>
          ),
        },
        {
          key: 'status',
          header: '상태',
          cell: (s) => <Badge tone={TONE[s.status]}>{STATUS[s.status]}</Badge>,
        },
        { key: 'when', header: '예정 · 지급일', cell: (s) => (s.paidAt ? dt(s.paidAt) : dt(s.scheduledAt)) },
      ]}
    />
  );
}

export default function AdminSettlementsPage() {
  return (
    <AdminPage
      title="정산"
      description="구매 확정 2일 뒤 지급 예정이 돼요. 실제 이체 후 '지급 완료'로 처리하고, 분쟁 중인 건은 보류하세요."
    >
      <Suspense>
        <Settlements />
      </Suspense>
    </AdminPage>
  );
}
