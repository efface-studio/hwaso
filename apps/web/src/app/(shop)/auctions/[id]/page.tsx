import { ApiError } from '@shop/api-client';
import type { AuctionSnapshot } from '@shop/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuctionLive } from '@/components/auction/auction-live';
import { EmptyState } from '@/components/ui/display';
import { mediaUrl } from '@/lib/media';
import { safe, serverApi } from '@/lib/server-api';

// 경매 상태는 매 요청 최신이어야 한다 (가격은 이후 소켓으로 갱신)
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await safe(serverApi.auctions.snapshot(id));
  if (!s) return { title: '경매' };
  const title = `[경매] ${s.product.title}${s.product.artistName ? ` - ${s.product.artistName}` : ''}`;
  return {
    title,
    description: `현재가 ${s.auction.currentPrice.toLocaleString('ko-KR')}원 · 입찰 ${s.auction.bidCount}회`,
    alternates: { canonical: `/products/${s.product.id}` },
    openGraph: {
      title,
      images: s.product.image ? [{ url: mediaUrl(s.product.image.key, 1600) }] : undefined,
    },
  };
}

export default async function AuctionPage({ params }: Props) {
  const { id } = await params;
  let snapshot: AuctionSnapshot;
  try {
    snapshot = await serverApi.auctions.snapshot(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    return (
      <EmptyState
        className="page-x"
        title="경매 정보를 불러오지 못했습니다"
        description="잠시 후 다시 시도해주세요."
      />
    );
  }
  return <AuctionLive initial={snapshot} />;
}
