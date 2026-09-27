import type { CategoryNode } from '@shop/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ProductGridSkeleton } from '@/components/product/product-card';
import { SearchView } from '@/components/search/search-view';
import { Breadcrumb } from '@/components/ui/navigation';
import { safe, serverApi } from '@/lib/server-api';

export const revalidate = 60;

function find(tree: CategoryNode[], slug: string): { node: CategoryNode; parent?: CategoryNode } | null {
  for (const g of tree) {
    if (g.slug === slug) return { node: g };
    const c = g.children.find((x) => x.slug === slug);
    if (c) return { node: c, parent: g };
  }
  return null;
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tree = (await safe(serverApi.market.categories())) ?? [];
  const hit = find(tree, slug);
  if (!hit) return { title: '카테고리' };
  return {
    title: hit.node.name,
    description: `${hit.node.name} 작품을 즉시 구매하거나 실시간 경매로 만나보세요.`,
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const tree = await safe(serverApi.market.categories());
  const hit = tree ? find(tree, slug) : null;
  if (tree && !hit) notFound();

  return (
    <>
      {hit && (
        <div className="page-x mx-auto max-w-page pt-4 md:pt-6">
          <Breadcrumb
            items={[
              { href: '/', label: '홈' },
              ...(hit.parent ? [{ href: `/category/${hit.parent.slug}`, label: hit.parent.name }] : []),
              { label: hit.node.name },
            ]}
          />
        </div>
      )}
      <Suspense
        fallback={
          <div className="page-x mx-auto max-w-page py-8">
            <ProductGridSkeleton />
          </div>
        }
      >
        <SearchView categories={tree ?? []} fixedCategory={slug} title={hit?.node.name ?? '카테고리'} />
      </Suspense>
    </>
  );
}
