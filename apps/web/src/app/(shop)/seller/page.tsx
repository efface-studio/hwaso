'use client';

import { ApiError } from '@shop/api-client';
import { AUCTION_STATUS_LABEL, formatPrice, formatRelativeTime, type SellerProductRow } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { OrderList } from '@/components/order/order-list';
import { Settlements } from '@/components/order/settlements';
import { MediaImage } from '@/components/product/media-image';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { DropdownMenu } from '@/components/ui/menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

const STATUS_LABEL: Record<SellerProductRow['status'], string> = {
  ACTIVE: '판매 중',
  RESERVED: '거래 중',
  SOLD: '판매 완료',
  DRAFT: '임시 저장',
  HIDDEN: '판매 중지',
  SUSPENDED: '운영 정지',
  PENDING_REVIEW: '검수 중',
};
const FILTERS = [
  ['all', '전체'],
  ['selling', '판매 중'],
  ['draft', '임시 저장'],
  ['hidden', '중지'],
  ['sold', '판매 완료'],
] as const;

const msg = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다.');

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span className="text-caption text-muted">{label}</span>
      <span className="tabular text-h2">{value.toLocaleString('ko-KR')}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex flex-col rounded-sm border border-border p-4 hover:border-foreground">
      {body}
    </Link>
  ) : (
    <div className="flex flex-col rounded-sm border border-border p-4">{body}</div>
  );
}

function Products() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const { data, isPending } = useQuery({
    queryKey: ['seller-products', filter],
    queryFn: () => api.market.sellerProducts(filter),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['seller-products'] });
    void qc.invalidateQueries({ queryKey: ['seller-stats'] });
  };
  const act = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<unknown>; ok: string }) => fn(),
    onSuccess: (_d, v) => {
      toast.success(v.ok);
      refresh();
    },
    onError: (e) => toast.error(msg(e)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={cn(
              'h-9 shrink-0 rounded-sm border px-3 text-label',
              filter === k ? 'border-foreground bg-foreground text-background' : 'border-border',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.length ? (
        <EmptyState
          title="등록한 작품이 없습니다"
          action={
            <Button asChild>
              <Link href="/sell">작품 등록하기</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border-soft border-y border-border-soft">
          {data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <Link href={`/sell/${p.id}/edit`} className="size-16 shrink-0 bg-background-soft">
                <MediaImage image={p.images[0] ?? null} alt="" sizes="64px" className="p-1" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={p.status === 'ACTIVE' ? 'primary' : 'outline'}>{STATUS_LABEL[p.status]}</Badge>
                  {p.auction && (
                    <Badge tone={p.auction.status === 'LIVE' ? 'live' : 'neutral'}>
                      경매 {AUCTION_STATUS_LABEL[p.auction.status]}
                    </Badge>
                  )}
                  {p._count.inquiries > 0 && (
                    <Badge tone="destructive">미답변 문의 {p._count.inquiries}</Badge>
                  )}
                </div>
                <Link
                  href={`/sell/${p.id}/edit`}
                  className="mt-0.5 block truncate text-body-strong hover:underline"
                >
                  {p.title}
                </Link>
                <p className="text-caption text-muted">
                  {p.auction
                    ? `현재가 ${formatPrice(p.auction.currentPrice)} · 입찰 ${p.auction.bidCount}`
                    : p.price
                      ? formatPrice(p.price)
                      : '가격 미정'}{' '}
                  · 조회 {p.viewCount} · 관심 {p.favoriteCount} · {formatRelativeTime(p.updatedAt)}
                </p>
              </div>
              <DropdownMenu
                trigger={
                  <Button variant="ghost" size="sm">
                    관리
                  </Button>
                }
                items={[
                  { label: '수정', onSelect: () => (window.location.href = `/sell/${p.id}/edit`) },
                  { label: '판매 페이지 보기', onSelect: () => (window.location.href = `/products/${p.id}`) },
                  ...(p.status === 'ACTIVE' && !p.auction
                    ? [
                        {
                          label: '판매 중지',
                          onSelect: () =>
                            act.mutate({ fn: () => api.market.pauseProduct(p.id), ok: '판매를 중지했어요' }),
                        },
                      ]
                    : []),
                  ...(p.status === 'HIDDEN'
                    ? [
                        {
                          label: '판매 재개',
                          onSelect: () =>
                            act.mutate({ fn: () => api.market.resumeProduct(p.id), ok: '판매를 재개했어요' }),
                        },
                      ]
                    : []),
                  ...(p.status === 'DRAFT' && p.saleType !== 'AUCTION'
                    ? [
                        {
                          label: '게시하기',
                          onSelect: () =>
                            act.mutate({ fn: () => api.market.publishProduct(p.id), ok: '게시했어요' }),
                        },
                      ]
                    : []),
                  ...(p.saleType === 'AUCTION' && !p.auction
                    ? [
                        {
                          label: '경매 등록',
                          onSelect: () => (window.location.href = `/seller/auctions/new?productId=${p.id}`),
                        },
                      ]
                    : []),
                  ...(p.auction?.status === 'SCHEDULED'
                    ? [
                        {
                          label: '경매 예약 취소',
                          onSelect: () =>
                            act.mutate({
                              fn: () => api.auctions.unschedule(p.auction!.id),
                              ok: '경매 예약을 취소했어요',
                            }),
                        },
                      ]
                    : []),
                  ...(p.auction && ['DRAFT', 'SCHEDULED'].includes(p.auction.status)
                    ? [
                        {
                          label: '경매 취소',
                          destructive: true,
                          onSelect: () =>
                            act.mutate({
                              fn: () => api.auctions.cancel(p.auction!.id),
                              ok: '경매를 취소했어요',
                            }),
                        },
                      ]
                    : []),
                  ...(!['SOLD', 'RESERVED'].includes(p.status)
                    ? [
                        {
                          label: '삭제',
                          destructive: true,
                          onSelect: () =>
                            confirm('작품을 삭제할까요? 되돌릴 수 없어요.') &&
                            act.mutate({ fn: () => api.market.deleteProduct(p.id), ok: '삭제했어요' }),
                        },
                      ]
                    : []),
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS = ['products', 'orders', 'settlements'];

function Dashboard() {
  const user = useAuthStore((s) => s.user)!;
  const params = useSearchParams();
  const [tab, setTab] = useState(TABS.includes(params.get('tab') ?? '') ? params.get('tab')! : 'products');
  useEffect(() => setTab(TABS.includes(params.get('tab') ?? '') ? params.get('tab')! : 'products'), [params]);
  const stats = useQuery({
    queryKey: ['seller-stats'],
    queryFn: api.market.sellerStats,
    enabled: user.isSeller,
  });
  if (!user.isSeller) {
    return (
      <div className="page-x mx-auto flex max-w-xl flex-col gap-4 py-10">
        <h1 className="text-h1">판매 관리</h1>
        <p className="text-body text-muted">판매자 등록 후 작품을 등록하고 관리할 수 있어요.</p>
        <Button asChild size="lg">
          <Link href="/my/seller?next=/seller">판매자 등록하기</Link>
        </Button>
      </div>
    );
  }
  const s = stats.data;
  return (
    <div className="page-x mx-auto max-w-page py-6 md:py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-h1">판매 관리</h1>
        <Button asChild>
          <Link href="/sell">
            <Plus className="size-4" aria-hidden />
            작품 등록
          </Link>
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="판매 중" value={s?.selling ?? 0} />
        <Stat label="진행 중 경매" value={s?.liveAuctions ?? 0} />
        <Stat label="발송 대기 주문" value={s?.ordersToShip ?? 0} href="/seller?tab=orders" />
        <Stat label="미답변 문의" value={s?.unansweredInquiries ?? 0} />
        <Stat label="누적 조회" value={s?.views ?? 0} />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="products">작품</TabsTrigger>
          <TabsTrigger value="orders">주문</TabsTrigger>
          <TabsTrigger value="settlements">정산</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="pt-4">
          <Products />
        </TabsContent>
        <TabsContent value="orders" className="pt-4">
          <OrderList as="seller" initialFilter="progress" />
        </TabsContent>
        <TabsContent value="settlements" className="pt-4">
          <Settlements />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SellerPage() {
  return (
    <RequireAuth>
      <Suspense>
        <Dashboard />
      </Suspense>
    </RequireAuth>
  );
}
