import { ApiError } from '@shop/api-client';
import type { ProductDetailDto } from '@shop/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Gallery } from '@/components/product/gallery';
import { Inquiries } from '@/components/product/inquiries';
import { priceInfo } from '@/components/product/price';
import { ProductInfo, SellerCard } from '@/components/product/product-info';
import { ProductRail, Section } from '@/components/product/product-rail';
import { PurchasePanel } from '@/components/product/purchase-panel';
import { EmptyState } from '@/components/ui/display';
import { Breadcrumb } from '@/components/ui/navigation';
import { env } from '@/lib/env';
import { mediaUrl } from '@/lib/media';
import { safe, serverApi } from '@/lib/server-api';

export const revalidate = 60;

/** 빌드 때는 비워 두고 첫 요청에 렌더해 revalidate 주기로 캐시한다 (on-demand ISR) */
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

/** 404 는 notFound, 그 외 오류는 null (에러 화면) */
async function load(id: string): Promise<ProductDetailDto | null> {
  try {
    return await serverApi.market.product(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await safe(serverApi.market.product(id));
  if (!p) return { title: '작품' };
  const who = p.artist?.name ?? p.artistName;
  const title = who ? `${p.title} - ${who}` : p.title;
  const description = p.description.replace(/\s+/g, ' ').slice(0, 160);
  const image = p.images[0] ? mediaUrl(p.images[0].key, 1600) : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/products/${p.id}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/products/${p.id}`,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

/** 구조화 데이터 (schema.org Product). `<` 를 이스케이프해 스크립트 주입을 막는다 */
function jsonLd(p: ProductDetailDto) {
  const { amount } = priceInfo(p);
  const availability =
    p.status === 'SOLD'
      ? 'https://schema.org/SoldOut'
      : p.saleType === 'RESERVATION'
        ? 'https://schema.org/PreOrder'
        : 'https://schema.org/InStock';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    description: p.description.slice(0, 500),
    image: p.images.map((i) => mediaUrl(i.key, 1600)),
    category: p.category.path.map((c) => c.name).join(' > '),
    ...(p.artist ? { brand: { '@type': 'Person', name: p.artist.name } } : {}),
    offers:
      amount == null
        ? undefined
        : {
            '@type': p.saleType === 'AUCTION' ? 'AggregateOffer' : 'Offer',
            priceCurrency: 'KRW',
            ...(p.saleType === 'AUCTION'
              ? { lowPrice: amount, offerCount: p.auction?.bidCount ?? 0 }
              : { price: amount }),
            availability,
            url: `${env.siteUrl}/products/${p.id}`,
          },
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  // 관련 작품은 본 작품과 함께 요청한다 (404 판단은 본 작품 결과로)
  const relatedP = safe(serverApi.market.related(id));
  const p = await load(id);
  if (!p) {
    return (
      <EmptyState
        className="page-x"
        title="작품을 불러오지 못했습니다"
        description="잠시 문제가 발생했습니다. 새로고침해 주세요."
      />
    );
  }
  const related = (await relatedP) ?? [];

  return (
    <div className="pb-28 md:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(p) }} />
      <div className="page-x mx-auto hidden max-w-page pt-6 md:block">
        <Breadcrumb
          items={[
            { href: '/', label: '홈' },
            ...p.category.path.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
            { label: p.title },
          ]}
        />
      </div>

      <div className="mx-auto max-w-page md:page-x md:mt-4 md:grid md:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] md:gap-10 lg:gap-16">
        <div className="md:sticky md:top-32 md:self-start">
          <Gallery images={p.images} title={p.title} />
        </div>
        <div className="page-x mt-5 md:mt-0 md:px-0">
          <PurchasePanel product={p} />
          <div className="mt-6">
            <SellerCard seller={p.seller} />
          </div>
        </div>
      </div>

      <div className="page-x mx-auto mt-6 max-w-page md:mt-12 md:grid md:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] md:gap-10 lg:gap-16">
        <div>
          <ProductInfo product={p} />
          <Inquiries productId={p.id} isMine={p.isMine} />
        </div>
      </div>

      {related.length > 0 && (
        <div className="page-x mx-auto mt-8 max-w-page">
          <Section title="이런 작품은 어떠세요?">
            <ProductRail items={related} />
          </Section>
        </div>
      )}
    </div>
  );
}
