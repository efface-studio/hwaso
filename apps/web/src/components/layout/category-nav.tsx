'use client';

import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MediaImage } from '@/components/product/media-image';
import { Skeleton } from '@/components/ui/display';
import { Sheet } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** 상단 탐색 탭 (KREAM·29CM 방식). 작품 분류는 오른쪽 "카테고리" 시트에서 고른다 */
const TABS = [
  { href: '/', label: '추천' },
  { href: '/auctions', label: '경매' },
  { href: '/search?sort=latest', label: '신착', sort: 'latest' },
  { href: '/search?sort=popular', label: '인기', sort: 'popular' },
] as const;

function Tabs({ activeSort }: { activeSort: string | null }) {
  const pathname = usePathname();
  const isActive = (t: (typeof TABS)[number]) =>
    'sort' in t
      ? pathname === '/search' && activeSort === t.sort
      : t.href === '/'
        ? pathname === '/'
        : pathname.startsWith(t.href);
  return (
    <ul className="flex min-w-0 flex-1 gap-5 md:gap-7">
      {TABS.map((t) => {
        const active = isActive(t);
        return (
          <li key={t.href} className="shrink-0">
            <Link
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center border-b-2 text-body-strong transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** useSearchParams 는 Suspense 안에서만 — 정적 렌더를 막지 않게 */
function TabsWithSort() {
  return <Tabs activeSort={useSearchParams().get('sort')} />;
}

function CategoryTiles({ onPick }: { onPick: () => void }) {
  const { data, isPending } = useQuery({
    queryKey: ['categories'],
    queryFn: api.market.categories,
    staleTime: 60_000,
  });
  if (isPending)
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  return (
    <div className="flex flex-col gap-8">
      {(data ?? []).map((root) => (
        <section key={root.id} aria-labelledby={`cat-${root.slug}`}>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 id={`cat-${root.slug}`} className="text-body-strong">
              {root.name}
            </h3>
            <Link
              href={`/category/${root.slug}`}
              onClick={onPick}
              className="text-small text-muted hover:text-foreground"
            >
              전체 {root.productCount}점
            </Link>
          </div>
          <ul className="grid grid-cols-3 gap-x-3 gap-y-4 md:grid-cols-3">
            {root.children.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.slug}`} onClick={onPick} className="group flex flex-col gap-1.5">
                  <span className="block aspect-square overflow-hidden rounded-sm bg-background-soft">
                    <MediaImage
                      image={c.coverImage}
                      alt=""
                      fit="cover"
                      sizes="(min-width: 768px) 130px, 30vw"
                      thumb
                      className="transition-transform duration-200 group-hover:scale-105"
                    />
                  </span>
                  <span className="truncate text-label">{c.name}</span>
                  <span className="-mt-1 text-caption text-muted">{c.productCount}점</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function CategoryNav() {
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="탐색" className="page-x mx-auto flex max-w-page items-center gap-4">
      <Suspense fallback={<Tabs activeSort={null} />}>
        <TabsWithSort />
      </Suspense>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="-mr-2 flex h-11 shrink-0 items-center gap-1.5 rounded-sm px-2 text-label font-semibold hover:bg-surface-2"
      >
        <LayoutGrid className="size-4" aria-hidden />
        카테고리
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="카테고리"
        side="bottom"
        // 모바일은 하단 시트, 데스크톱은 오른쪽 패널
        className="md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-t-0 md:border-l"
      >
        <CategoryTiles onPick={() => setOpen(false)} />
      </Sheet>
    </nav>
  );
}
