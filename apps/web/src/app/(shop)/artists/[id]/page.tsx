import { ApiError } from '@shop/api-client';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/product/product-card';
import { EmptyState } from '@/components/ui/display';
import { Breadcrumb } from '@/components/ui/navigation';
import { safe, serverApi } from '@/lib/server-api';

export const revalidate = 60;

type Props = { params: Promise<{ id: string }> };

const lifespan = (b: number | null, d: number | null) => (b ? `${b}–${d ?? ''}` : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const a = await safe(serverApi.market.artist(id));
  if (!a) return { title: '작가' };
  return {
    title: `${a.name}${a.nameEn ? ` (${a.nameEn})` : ''}`,
    description: `${a.name}의 작품 ${a.productCount}점을 만나보세요.`,
    alternates: { canonical: `/artists/${a.id}` },
  };
}

export default async function ArtistPage({ params }: Props) {
  const { id } = await params;
  let artist;
  try {
    artist = await serverApi.market.artist(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    return <EmptyState title="작가 정보를 불러오지 못했습니다" description="잠시 후 다시 시도해주세요." />;
  }
  const works = await safe(serverApi.market.products({ artist: id, sort: 'popular', limit: 60 }));

  return (
    <div className="page-x mx-auto max-w-page py-6 md:py-10">
      <Breadcrumb items={[{ href: '/', label: '홈' }, { label: '작가' }, { label: artist.name }]} />
      <header className="mt-6 flex flex-col gap-2 border-b border-border pb-8">
        <h1 className="text-display">{artist.name}</h1>
        <p className="text-body text-muted">
          {[artist.nameEn, artist.nationality, lifespan(artist.birthYear, artist.deathYear)]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {artist.bio && <p className="mt-2 max-w-2xl text-body whitespace-pre-wrap">{artist.bio}</p>}
      </header>
      <section className="mt-8" aria-labelledby="works">
        <h2 id="works" className="mb-4 text-h2">
          작품 <span className="text-muted">{artist.productCount}</span>
        </h2>
        {works?.items.length ? (
          <ProductGrid items={works.items} priorityCount={4} />
        ) : (
          <EmptyState title="판매 중인 작품이 없습니다" />
        )}
      </section>
    </div>
  );
}
