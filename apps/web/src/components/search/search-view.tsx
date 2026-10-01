'use client';

import {
  PRODUCT_SORTS,
  SORT_LABEL,
  type CategoryNode,
  type ProductListParams,
  type ProductListResponse,
  type ProductSort,
} from '@shop/shared';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SearchX, SlidersHorizontal } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { hasSessionHint } from '@/stores/auth';
import { FilterPanel, type FilterValue } from './filter-panel';
import { SearchAutocomplete } from './search-autocomplete';
import { parseSearch, sameListParams, toListParams } from './search-params';

/** 모바일 필터 시트(Radix Dialog)는 처음 열 때 불러온다 — 목록 화면 첫 번들에서 뺀다 */
const loadDialog = () => import('@/components/ui/dialog');
const Sheet = dynamic(() => loadDialog().then((m) => m.Sheet), { ssr: false });

function activeCount(f: FilterValue, fixedCategory?: string) {
  return (
    (f.category && !fixedCategory ? 1 : 0) +
    f.saleType.length +
    (f.minPrice != null || f.maxPrice != null ? 1 : 0) +
    f.condition.length +
    f.era.length +
    f.material.length +
    f.region.length +
    (f.verifiedOnly ? 1 : 0)
  );
}

interface SearchViewProps {
  categories: CategoryNode[];
  /** 카테고리 페이지: 카테고리 고정 */
  fixedCategory?: string;
  title?: string;
  /** 서버가 미리 받은 첫 페이지 — 조회 조건이 같을 때만 쓴다 (API 왕복 없이 바로 그린다) */
  initial?: { params: ProductListParams; page: ProductListResponse };
}

export function SearchView({ categories, fixedCategory, title, initial }: SearchViewProps) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { q, sort, filter } = useMemo(
    () => parseSearch(new URLSearchParams(sp.toString()), fixedCategory),
    [sp, fixedCategory],
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  // 한 번 연 뒤에는 계속 마운트해 둔다 (닫힘 애니메이션 유지)
  const [sheetMounted, setSheetMounted] = useState(false);

  const update = useCallback(
    (patch: Partial<FilterValue> & { sort?: ProductSort }) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'category' && fixedCategory) continue;
        if (v === undefined || v === false || v === '' || (Array.isArray(v) && v.length === 0))
          next.delete(k);
        else next.set(k, Array.isArray(v) ? v.join(',') : String(v));
      }
      router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [sp, router, pathname, fixedCategory],
  );

  const params = toListParams({ q, sort, filter });
  const seeded = initial && sameListParams(initial.params, params) ? initial.page : undefined;

  const query = useInfiniteQuery({
    queryKey: ['products', params],
    queryFn: ({ pageParam, signal }) => api.market.products({ ...params, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    initialData: seeded ? { pages: [seeded], pageParams: [undefined] } : undefined,
    // 서버 사본은 비로그인 기준(관심 표시 없음) — 로그인한 적 있는 브라우저는 마운트 때 다시 받는다
    initialDataUpdatedAt: seeded && typeof window !== 'undefined' && hasSessionHint() ? 0 : undefined,
  });
  const facets = useQuery({
    queryKey: ['facets', filter.category],
    queryFn: () => api.market.facets(filter.category),
    staleTime: 5 * 60_000,
  });

  // 무한 스크롤
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage)
          void query.fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total;
  const filters = activeCount(filter, fixedCategory);
  const sortOptions = PRODUCT_SORTS.filter((s) => s !== 'relevance' || q).map((s) => ({
    value: s,
    label: SORT_LABEL[s],
  }));

  const panel = (
    <FilterPanel
      value={filter}
      onChange={update}
      categories={categories}
      facets={facets.data}
      categoryAsLinks={!!fixedCategory}
    />
  );

  return (
    <div className="page-x mx-auto max-w-page py-4 md:py-8">
      {!fixedCategory && <SearchAutocomplete initial={q} className="mb-4 md:hidden" />}
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-h1">{title ?? (q ? `‘${q}’ 검색 결과` : '전체 작품')}</h1>
      </div>

      <div className="mt-4 grid gap-8 md:mt-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="필터">
          <div className="sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto pr-2">{panel}</div>
        </aside>

        <div className="min-w-0">
          <div className="sticky top-(--header-h) z-10 -mx-4 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2 md:static md:mx-0 md:border-none md:px-0 md:py-0">
            <p className="text-small text-muted" aria-live="polite">
              {total == null ? ' ' : `작품 ${total.toLocaleString('ko-KR')}개`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => {
                  setSheetMounted(true);
                  setSheetOpen(true);
                }}
                // 누르기 전에 미리 받아 둔다
                onPointerEnter={() => void loadDialog()}
                onFocus={() => void loadDialog()}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                필터{filters > 0 && <span className="tabular text-primary">{filters}</span>}
              </Button>
              <Select
                aria-label="정렬"
                size="sm"
                className="w-36"
                value={sort}
                onValueChange={(v) => update({ sort: v })}
                options={sortOptions}
              />
            </div>
          </div>

          <div className="mt-4">
            {query.isPending ? (
              <ProductGridSkeleton />
            ) : query.isError ? (
              <EmptyState
                title="작품을 불러오지 못했습니다"
                description="잠시 문제가 발생했습니다. 다시 시도해주세요."
                action={
                  <Button variant="outline" onClick={() => void query.refetch()}>
                    다시 시도
                  </Button>
                }
              />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<SearchX />}
                title="조건에 맞는 작품이 없습니다"
                description="검색어를 바꾸거나 필터를 줄여보세요."
                action={
                  filters > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        update({
                          saleType: [],
                          condition: [],
                          era: [],
                          material: [],
                          region: [],
                          minPrice: undefined,
                          maxPrice: undefined,
                          verifiedOnly: false,
                          category: undefined,
                        })
                      }
                    >
                      필터 초기화
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <ProductGrid items={items} priorityCount={4} />
                <div ref={sentinel} aria-hidden className="h-px" />
                {query.isFetchingNextPage && (
                  <div className="mt-8">
                    <ProductGridSkeleton count={4} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {sheetMounted && (
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          side="bottom"
          title="필터"
          footer={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  update({
                    saleType: [],
                    condition: [],
                    era: [],
                    material: [],
                    region: [],
                    minPrice: undefined,
                    maxPrice: undefined,
                    verifiedOnly: false,
                    category: undefined,
                  })
                }
              >
                초기화
              </Button>
              <Button block onClick={() => setSheetOpen(false)}>
                {total == null ? '결과 보기' : `작품 ${total.toLocaleString('ko-KR')}개 보기`}
              </Button>
            </div>
          }
        >
          {panel}
        </Sheet>
      )}
    </div>
  );
}
