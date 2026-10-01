import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductGridSkeleton } from '@/components/product/product-card';
import { parseSearch, SEED_TIMEOUT_MS, toListParams } from '@/components/search/search-params';
import { SearchView } from '@/components/search/search-view';
import { safe, serverApi } from '@/lib/server-api';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `‘${q}’ 검색 결과` : '작품 검색',
    // 검색 결과 페이지는 색인하지 않는다 (중복 콘텐츠)
    robots: { index: false, follow: true },
  };
}

type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * 첫 페이지를 서버에서 받아 HTML 에 바로 그린다 (LCP 이미지가 JS·API 왕복을 기다리지 않게).
 * 서버 요청은 60초 캐시(serverApi)를 쓰므로, 캐시 키가 끝없이 늘 수 있는 자유 입력(q·가격·시대·재질·지역)과
 * 모르는 카테고리는 기존처럼 클라이언트에서 조회한다. 탭(신착·인기)·카테고리·판매 방식 같은 정해진 조합만 해당.
 */
function cacheable(p: ReturnType<typeof parseSearch>, slugs: Set<string>) {
  const f = p.filter;
  return (
    !p.q &&
    f.minPrice == null &&
    f.maxPrice == null &&
    !f.era.length &&
    !f.material.length &&
    !f.region.length &&
    (!f.category || slugs.has(f.category))
  );
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) for (const x of [v ?? []].flat()) sp.append(k, x);
  const parsed = parseSearch(sp);
  const params = toListParams(parsed);
  const categories = (await safe(serverApi.market.categories())) ?? [];
  const slugs = new Set(categories.flatMap((c) => [c.slug, ...c.children.map((x) => x.slug)]));
  const page = cacheable(parsed, slugs)
    ? await safe(serverApi.market.products(params, AbortSignal.timeout(SEED_TIMEOUT_MS)))
    : null;
  return (
    <Suspense
      fallback={
        <div className="page-x mx-auto max-w-page py-8">
          <ProductGridSkeleton />
        </div>
      }
    >
      <SearchView categories={categories} initial={page ? { params, page } : undefined} />
    </Suspense>
  );
}
