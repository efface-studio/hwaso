import { ImageOff } from 'lucide-react';
import Link from 'next/link';
import { BannerCarousel } from '@/components/home/banner-carousel';
import { PersonalSections } from '@/components/home/personal-sections';
import { MediaImage } from '@/components/product/media-image';
import { ProductCard } from '@/components/product/product-card';
import { ProductRail, Section } from '@/components/product/product-rail';
import { EmptyState } from '@/components/ui/display';
import { safe, serverApi } from '@/lib/server-api';

export const revalidate = 60;

export default async function HomePage() {
  const home = await safe(serverApi.market.home());

  return (
    <div className="page-x mx-auto flex max-w-page flex-col gap-12 py-6 md:gap-16 md:py-10">
      {!home ? (
        <EmptyState
          icon={<ImageOff />}
          title="작품을 불러오지 못했습니다"
          description="잠시 문제가 발생했습니다. 새로고침해 주세요."
        />
      ) : (
        <>
          {home.banners.length > 0 && (
            <div className="-mx-4 -mt-6 md:mx-0 md:mt-0">
              <BannerCarousel banners={home.banners} />
            </div>
          )}
          {home.liveAuctions.length > 0 && (
            <Section
              title="지금 진행 중인 경매"
              description="실시간으로 입찰이 이어지고 있어요"
              href="/auctions"
            >
              <ProductRail items={home.liveAuctions} priority />
            </Section>
          )}

          {home.endingSoon.length > 0 && (
            <Section title="마감 임박" href="/search?sort=ending_soon">
              <ProductRail items={home.endingSoon} />
            </Section>
          )}

          <PersonalSections />

          {home.popular.length > 0 && (
            <Section title="지금 많이 찾는 작품" href="/search?sort=popular">
              <div className="grid grid-cols-2 gap-x-2 gap-y-6 md:grid-cols-4 md:gap-x-4 md:gap-y-8 lg:grid-cols-6">
                {home.popular.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    sizes="(min-width: 1024px) 16vw, (min-width: 768px) 25vw, 50vw"
                  />
                ))}
              </div>
            </Section>
          )}

          {home.collections.map((c) => (
            <Section
              key={c.category.slug}
              title={`추천 컬렉션 · ${c.category.name}`}
              href={`/category/${c.category.slug}`}
            >
              <ProductRail items={c.items} />
            </Section>
          ))}

          {home.popularArtists.length > 0 && (
            <Section title="인기 작가" href="/search">
              <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-5 md:px-0 lg:grid-cols-10">
                {home.popularArtists.map((a) => (
                  <li key={a.id} className="w-24 shrink-0 md:w-auto">
                    <Link
                      href={`/artists/${a.id}`}
                      className="group flex flex-col items-center gap-2 text-center"
                    >
                      <span className="block aspect-square w-full overflow-hidden rounded-full bg-background-soft">
                        <MediaImage image={a.image} alt="" fit="cover" sizes="96px" />
                      </span>
                      <span className="line-clamp-2 text-small group-hover:underline">{a.name}</span>
                      <span className="text-caption text-muted">작품 {a.productCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {home.upcomingAuctions.length > 0 && (
            <Section
              title="곧 시작하는 경매"
              description="관심 등록하면 시작할 때 알려드려요"
              href="/auctions?tab=scheduled"
            >
              <ProductRail items={home.upcomingAuctions} />
            </Section>
          )}

          {home.newArrivals.length > 0 && (
            <Section title="새로 등록된 작품" href="/search?sort=latest">
              <ProductRail items={home.newArrivals} />
            </Section>
          )}

          {home.notices.length > 0 && (
            <section aria-label="공지사항" className="border-t border-border pt-6">
              <ul className="flex flex-col gap-2">
                {home.notices.map((n) => (
                  <li key={n.id} className="flex items-center gap-3 text-small">
                    <span className="text-muted">공지</span>
                    <Link href={`/notices/${n.id}`} className="truncate hover:underline">
                      {n.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
