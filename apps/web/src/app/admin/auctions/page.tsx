'use client';

import {
  AUCTION_STATUS_LABEL,
  formatPrice,
  type AdminAuctionRow,
  type AuctionPolicyInput,
} from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { AdminList, dt, useAdminAction, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { PromptDialog } from '@/components/admin/prompt-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api';

const POLICY_FIELDS: [keyof AuctionPolicyInput, string, string][] = [
  ['extensionWindowSec', '연장 기준 (초)', '종료 몇 초 안의 입찰이면 연장할지'],
  ['extensionSec', '연장 시간 (초)', '한 번에 늘릴 시간'],
  ['maxExtensionSec', '최대 연장 (초)', '처음 종료 시각 대비 최대로 늘릴 수 있는 시간'],
  ['paymentDueHours', '낙찰 결제 기한 (시간)', '지나면 주문 취소·미결제 기록'],
  ['minDurationMin', '최소 경매 기간 (분)', ''],
  ['maxDurationDays', '최대 경매 기간 (일)', ''],
  ['endingSoonMin', '종료 임박 알림 (분 전)', '입찰자·관심 사용자에게 알림'],
];

function Policy() {
  const { data } = useQuery({ queryKey: ['admin', 'policy'], queryFn: api.admin.policy });
  const [form, setForm] = useState<AuctionPolicyInput | null>(null);
  useEffect(() => {
    if (data) setForm(Object.fromEntries(POLICY_FIELDS.map(([k]) => [k, data[k]])) as AuctionPolicyInput);
  }, [data]);
  const save = useAdminAction((p: AuctionPolicyInput) => api.admin.setPolicy(p), '경매 정책을 저장했어요', [
    'policy',
  ]);
  if (!form) return null;
  return (
    <section className="rounded-sm border border-border bg-background p-5">
      <h2 className="text-h3">경매 정책</h2>
      <p className="mt-1 text-small text-muted">새로 등록·예약되는 경매부터 적용돼요.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {POLICY_FIELDS.map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint || undefined}>
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={0}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
              />
            )}
          </Field>
        ))}
      </div>
      <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate(form)}>
        저장
      </Button>
    </section>
  );
}

function Auctions() {
  const list = useAdminList<AdminAuctionRow>('auctions', api.admin.auctions);
  const [cancel, setCancel] = useState<AdminAuctionRow | null>(null);
  const run = useAdminAction(
    (v: { id: string; r: string }) => api.admin.cancelAuction(v.id, v.r),
    '경매를 취소했어요',
    ['auctions'],
  );
  return (
    <>
      <AdminList
        list={list}
        rowKey={(a) => a.id}
        searchPlaceholder="작품명 · 경매 ID"
        filters={[
          {
            key: 'status',
            label: '상태',
            options: Object.entries(AUCTION_STATUS_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        columns={[
          {
            key: 'title',
            header: '작품',
            cell: (a) => (
              <Link href={`/auctions/${a.id}`} target="_blank" className="hover:underline">
                {a.title}
              </Link>
            ),
          },
          { key: 'seller', header: '판매자', cell: (a) => a.seller.nickname },
          {
            key: 'status',
            header: '상태',
            cell: (a) => (
              <Badge tone={a.status === 'LIVE' ? 'live' : 'neutral'}>
                {AUCTION_STATUS_LABEL[a.status]}
                {a.result === 'UNPAID' ? ' · 미결제' : ''}
              </Badge>
            ),
          },
          {
            key: 'price',
            header: '현재가 · 입찰',
            cell: (a) => `${formatPrice(a.currentPrice)} · ${a.bidCount}회`,
          },
          { key: 'time', header: '기간', cell: (a) => `${dt(a.startsAt)} ~ ${dt(a.endsAt)}` },
          {
            key: 'act',
            header: '',
            cell: (a) =>
              ['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED'].includes(a.status) ? (
                <Button size="sm" variant="ghost" onClick={() => setCancel(a)}>
                  강제 취소
                </Button>
              ) : null,
          },
        ]}
      />
      {cancel && (
        <PromptDialog
          open
          onOpenChange={(v) => !v && setCancel(null)}
          title="경매 강제 취소"
          description={`${cancel.title} — 입찰자와 판매자에게 영향이 있어요. 위작·파손 등 정당한 사유가 확인된 경우에만 사용하세요.`}
          confirmLabel="취소"
          destructive
          pending={run.isPending}
          onSubmit={(r) => run.mutate({ id: cancel.id, r }, { onSuccess: () => setCancel(null) })}
        />
      )}
    </>
  );
}

export default function AdminAuctionsPage() {
  return (
    <AdminPage title="경매" description="진행·예정 경매를 확인하고 정책을 조정해요.">
      <Suspense>
        <Auctions />
      </Suspense>
      <Policy />
    </AdminPage>
  );
}
