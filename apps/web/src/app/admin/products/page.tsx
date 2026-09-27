'use client';

import {
  PRODUCT_STATUSES,
  VERIFICATION_LABEL,
  VERIFICATION_STATUSES,
  formatPrice,
  type AdminProductRow,
} from '@shop/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AdminList, dt, useAdminAction, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { PromptDialog } from '@/components/admin/prompt-dialog';
import { MediaImage } from '@/components/product/media-image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { DropdownMenu } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';

const STATUS: Record<string, string> = {
  ACTIVE: '판매 중',
  RESERVED: '거래 중',
  SOLD: '판매 완료',
  DRAFT: '임시',
  HIDDEN: '판매 중지',
  SUSPENDED: '운영 정지',
  PENDING_REVIEW: '검수 중',
};
const TITLES = {
  hide: '운영 비공개',
  restore: '비공개 해제',
  delete: '작품 삭제',
  reject: '인증서 반려',
} as const;
type Act = { kind: keyof typeof TITLES; p: AdminProductRow } | null;
type V = { id: string; r: string };

function Products() {
  const sp = useSearchParams();
  const list = useAdminList<AdminProductRow>('products', api.admin.products, {
    verification: sp.get('verification') ?? undefined,
    status: sp.get('status') ?? undefined,
  });
  const [act, setAct] = useState<Act>(null);
  const inv = ['products'];
  const hide = useAdminAction((v: V) => api.admin.hideProduct(v.id, v.r), '비공개 처리했어요', inv);
  const restore = useAdminAction((v: V) => api.admin.restoreProduct(v.id, v.r), '비공개를 해제했어요', inv);
  const remove = useAdminAction((v: V) => api.admin.deleteProduct(v.id, v.r), '삭제했어요', inv);
  const review = useAdminAction(
    (v: { id: string; status: 'VERIFIED' | 'REJECTED'; note: string }) =>
      api.admin.reviewCertificate(v.id, v.status, v.note),
    '검수 결과를 반영했어요',
    inv,
  );
  const done = { onSuccess: () => setAct(null) };

  return (
    <>
      <AdminList
        list={list}
        rowKey={(p) => p.id}
        searchPlaceholder="작품명 · ID"
        filters={[
          {
            key: 'status',
            label: '상태',
            options: PRODUCT_STATUSES.map((s) => ({ value: s, label: STATUS[s] ?? s })),
          },
          {
            key: 'verification',
            label: '검수',
            options: VERIFICATION_STATUSES.map((s) => ({ value: s, label: VERIFICATION_LABEL[s] })),
          },
        ]}
        columns={[
          {
            key: 'work',
            header: '작품',
            cell: (p) => (
              <Link
                href={`/products/${p.id}`}
                target="_blank"
                className="flex items-center gap-2 hover:underline"
              >
                <span className="size-10 shrink-0 bg-background-soft">
                  <MediaImage image={p.image} alt="" sizes="40px" />
                </span>
                <span className="line-clamp-2 max-w-60">{p.title}</span>
              </Link>
            ),
          },
          { key: 'seller', header: '판매자', cell: (p) => p.seller.nickname },
          { key: 'price', header: '가격', cell: (p) => (p.price != null ? formatPrice(p.price) : '경매') },
          {
            key: 'status',
            header: '상태',
            cell: (p) => (
              <Badge tone={p.status === 'SUSPENDED' || p.deletedAt ? 'destructive' : 'neutral'}>
                {p.deletedAt ? '삭제됨' : (STATUS[p.status] ?? p.status)}
              </Badge>
            ),
          },
          {
            key: 'cert',
            header: '인증서',
            cell: (p) =>
              p.certificate ? (
                <span className="flex flex-col">
                  <span>{VERIFICATION_LABEL[p.verificationStatus]}</span>
                  <span className="text-caption text-muted">
                    {p.certificate.issuer} {p.certificate.number}{' '}
                    {p.certificate.imageKey && (
                      <a
                        href={mediaUrl(p.certificate.imageKey, 1600)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        원본
                      </a>
                    )}
                  </span>
                </span>
              ) : (
                '-'
              ),
          },
          {
            key: 'reports',
            header: '신고',
            cell: (p) => (p.reportCount ? <Badge tone="destructive">{p.reportCount}</Badge> : '-'),
          },
          { key: 'created', header: '등록', cell: (p) => dt(p.createdAt) },
          {
            key: 'menu',
            header: '',
            cell: (p) =>
              p.deletedAt ? null : (
                <DropdownMenu
                  trigger={
                    <Button size="sm" variant="ghost">
                      관리
                    </Button>
                  }
                  items={[
                    ...(p.certificate && p.verificationStatus !== 'VERIFIED'
                      ? [
                          {
                            label: '인증서 승인',
                            onSelect: () => review.mutate({ id: p.id, status: 'VERIFIED', note: '' }),
                          },
                        ]
                      : []),
                    ...(p.certificate
                      ? [{ label: '인증서 반려', onSelect: () => setAct({ kind: 'reject', p }) }]
                      : []),
                    p.status === 'SUSPENDED'
                      ? { label: '비공개 해제', onSelect: () => setAct({ kind: 'restore', p }) }
                      : {
                          label: '운영 비공개',
                          destructive: true,
                          onSelect: () => setAct({ kind: 'hide', p }),
                        },
                    { label: '삭제', destructive: true, onSelect: () => setAct({ kind: 'delete', p }) },
                  ]}
                />
              ),
          },
        ]}
      />
      {act && (
        <PromptDialog
          open
          onOpenChange={(v) => !v && setAct(null)}
          title={TITLES[act.kind]}
          description={act.p.title}
          label={act.kind === 'reject' ? '반려 사유 (판매자에게 안내돼요)' : '사유'}
          confirmLabel="확인"
          destructive={act.kind !== 'restore'}
          pending={hide.isPending || restore.isPending || remove.isPending || review.isPending}
          onSubmit={(r) => {
            const v = { id: act.p.id, r };
            if (act.kind === 'hide') hide.mutate(v, done);
            else if (act.kind === 'restore') restore.mutate(v, done);
            else if (act.kind === 'delete') remove.mutate(v, done);
            else review.mutate({ id: act.p.id, status: 'REJECTED', note: r }, done);
          }}
        />
      )}
    </>
  );
}

export default function AdminProductsPage() {
  return (
    <AdminPage
      title="작품 · 검수"
      description="신고가 쌓인 작품을 비공개하고, 인증서 원본을 대조해 플랫폼 검수 표시를 붙여요."
    >
      <Suspense>
        <Products />
      </Suspense>
    </AdminPage>
  );
}
