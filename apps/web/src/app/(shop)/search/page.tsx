import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductGridSkeleton } from '@/components/product/product-card';
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

export default async function SearchPage() {
  const categories = (await safe(serverApi.market.categories())) ?? [];
  return (
    <Suspense
      fallback={
        <div className="page-x mx-auto max-w-page py-8">
          <ProductGridSkeleton />
        </div>
      }
    >
      <SearchView categories={categories} />
    </Suspense>
  );
}
