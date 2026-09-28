'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Gavel } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/product-card';
import { EmptyState } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const TABS = [
  { key: 'live', label: '진행 중' },
  { key: 'scheduled', label: '시작 예정' },
  { key: 'ended', label: '종료' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function AuctionList() {
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'scheduled' || raw === 'ended' ? raw : 'live';
  const query = useInfiniteQuery({
    queryKey: ['auctions', tab],
    queryFn: ({ pageParam, signal }) =>
      api.auctions.list({ status: tab, cursor: pageParam, limit: 24 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: tab === 'live' ? 30_000 : false,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage)
          void query.fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query]);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <nav aria-label="경매 상태" className="mt-6 flex gap-6 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'live' ? '/auctions' : `/auctions?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              '-mb-px flex h-11 items-center border-b-2 text-label',
              tab === t.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {t.label}
            {tab === t.key && query.data && (
              <span className="ml-1.5 text-muted">{query.data.pages[0]?.total}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        {query.isPending ? (
          <ProductGridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Gavel />}
            title={`${TABS.find((t) => t.key === tab)!.label}인 경매가 없습니다`}
          />
        ) : (
          <>
            <ProductGrid items={items} priorityCount={4} />
            <div ref={sentinel} aria-hidden className="h-px" />
          </>
        )}
      </div>
    </>
  );
}

/** 탭(쿼리스트링)을 읽기 전 서버 HTML — 목록과 같은 자리를 잡아 두어 레이아웃이 흔들리지 않게 한다 */
function ListFallback() {
  return (
    <>
      <div className="mt-6 flex gap-6 border-b border-border" aria-hidden>
        {TABS.map((t) => (
          <span key={t.key} className="flex h-11 items-center text-label text-muted">
            {t.label}
          </span>
        ))}
      </div>
      <div className="mt-6">
        <ProductGridSkeleton />
      </div>
    </>
  );
}

export default function AuctionsPage() {
  return (
    <div className="page-x mx-auto max-w-page py-6 md:py-10">
      <h1 className="text-h1">경매</h1>
      <p className="mt-1 text-body text-muted">실시간으로 입찰하고, 마감 직전 입찰 시 자동으로 연장돼요.</p>
      <Suspense fallback={<ListFallback />}>
        <AuctionList />
      </Suspense>
    </div>
  );
}
