'use client';

import { AUCTION_STATUS_LABEL, formatPrice, formatRelativeTime, type MyBidDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Gavel, Trophy } from 'lucide-react';
import Link from 'next/link';
import { AuctionCountdown } from '@/components/product/countdown';
import { MediaImage } from '@/components/product/media-image';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { Breadcrumb } from '@/components/ui/navigation';
import { api } from '@/lib/api';

function statusBadge(b: MyBidDto) {
  const a = b.auction;
  if (a.status === 'LIVE')
    return a.highestBidderIsMe ? (
      <Badge tone="primary">최고 입찰</Badge>
    ) : (
      <Badge tone="destructive">상회 입찰됨</Badge>
    );
  if (a.status === 'ENDED' || a.status === 'SETTLED') {
    if (a.highestBidderIsMe && a.result === 'SOLD') return <Badge tone="primary">낙찰</Badge>;
    if (a.result === 'UNPAID' && a.highestBidderIsMe) return <Badge tone="destructive">미결제 취소</Badge>;
    return <Badge tone="outline">패찰</Badge>;
  }
  return <Badge tone="outline">{AUCTION_STATUS_LABEL[a.status]}</Badge>;
}

/** 입찰 내역(/my/bids) · 낙찰 내역(/my/wins) — 같은 화면을 공유한다 */
export function BidHistory({ wins }: { wins: boolean }) {
  const { data, isPending } = useQuery({
    queryKey: [wins ? 'my-wins' : 'my-bids'],
    queryFn: wins ? api.auctions.myWins : api.auctions.myBids,
  });
  const title = wins ? '낙찰 내역' : '입찰 내역';
  return (
    <div className="page-x mx-auto max-w-3xl py-6 md:py-10">
      <Breadcrumb items={[{ href: '/my', label: '마이' }, { label: title }]} />
      <h1 className="mt-4 mb-6 text-h1">{title}</h1>
      {isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={wins ? <Trophy /> : <Gavel />}
          title={wins ? '낙찰받은 작품이 없습니다' : '입찰한 경매가 없습니다'}
          action={
            <Button asChild variant="outline">
              <Link href="/auctions">진행 중인 경매 보기</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border-soft border-y border-border-soft">
          {data.map((b) => (
            <li key={b.auction.id} className="flex gap-4 py-4">
              <Link
                href={`/auctions/${b.auction.id}`}
                className="size-20 shrink-0 bg-background-soft"
                tabIndex={-1}
                aria-hidden
              >
                <MediaImage image={b.product.image} alt="" sizes="80px" className="p-1.5" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  {statusBadge(b)}
                  {b.auction.status === 'LIVE' && (
                    <span className="text-caption">
                      <AuctionCountdown endsAt={b.auction.endsAt} status="LIVE" compact />
                    </span>
                  )}
                </div>
                <Link
                  href={`/auctions/${b.auction.id}`}
                  className="truncate text-body-strong hover:underline"
                >
                  {b.product.title}
                </Link>
                <p className="text-small text-muted">
                  내 최고 {formatPrice(b.myMaxBid)} · {b.myBidCount}회 입찰 · 현재{' '}
                  {formatPrice(b.auction.currentPrice)} · {formatRelativeTime(b.lastBidAt)}
                </p>
              </div>
              {b.orderId && (
                <Button asChild size="sm" className="self-center">
                  <Link href={`/orders/${b.orderId}`}>결제하기</Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
