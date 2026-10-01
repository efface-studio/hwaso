'use client';

import { AUCTION_STATUS_LABEL, formatPrice, formatRelativeTime, type AuctionSnapshot } from '@shop/shared';
import { Eye, Gavel, Users, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuctionCountdown } from '@/components/product/countdown';
import { MediaImage } from '@/components/product/media-image';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/dialog';
import { Alert, Badge } from '@/components/ui/display';
import { useServerNow } from '@/lib/clock';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import { BidPanel } from './bid-panel';
import { useAuctionLive } from './use-auction-live';

/** 실시간 경매 화면 — 현재가·남은 시간·입찰 기록·참여자 수가 서버 이벤트로 즉시 갱신된다 */
export function AuctionLive({ initial }: { initial: AuctionSnapshot }) {
  const { snapshot, bids, connected, event, refetch } = useAuctionLive(initial.auction.id, initial);
  const s = snapshot ?? initial;
  const a = s.auction;
  const user = useAuthStore((st) => st.user);
  const now = useServerNow();
  const [flash, setFlash] = useState(false);
  const [sheet, setSheet] = useState(false);

  // 가격 변경 하이라이트 (의미 있는 애니메이션만 — docs/DESIGN_SYSTEM.md §6)
  useEffect(() => {
    if (event?.kind !== 'price') return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [event]);

  const timeUp = a.status === 'LIVE' && now != null && Date.parse(a.endsAt) <= now;
  const closed = a.status !== 'LIVE' || timeUp;
  const won = a.status !== 'LIVE' && a.winnerId === user?.id && a.result === 'SOLD';
  const outbid = a.status === 'LIVE' && !!s.myLastBid && a.highestBidderId !== user?.id;

  const panel = <BidPanel auction={a} closed={closed} onPlaced={() => void refetch()} />;

  return (
    <div className="pb-28 md:pb-0">
      {!connected && (
        <div
          role="status"
          className="sticky top-(--header-h) z-20 flex items-center justify-center gap-2 bg-warning/10 py-2 text-small text-warning"
        >
          <WifiOff className="size-4" aria-hidden />
          실시간 연결이 끊겼어요. 다시 연결하는 중…
        </div>
      )}

      <div className="mx-auto max-w-page md:page-x md:mt-6 md:grid md:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)] md:gap-10 lg:gap-16">
        <div className="md:sticky md:top-32 md:self-start">
          <Link
            href={`/products/${s.product.id}`}
            className="relative block aspect-square bg-background-soft md:aspect-[4/5]"
          >
            <MediaImage
              image={s.product.image}
              alt={s.product.title}
              // 왼쪽 칸은 페이지 폭(최대 1280)의 약 3/5 (상품 상세 갤러리와 같다)
              sizes="(min-width: 1280px) 700px, (min-width: 768px) 60vw, 100vw"
              priority
              className="p-4 md:p-10"
            />
          </Link>
        </div>

        <div className="page-x mt-5 flex flex-col gap-5 md:mt-0 md:px-0">
          <div className="flex items-center gap-2">
            <Badge tone={a.status === 'LIVE' ? 'live' : 'outline'}>
              {a.status === 'LIVE' ? 'LIVE 경매' : AUCTION_STATUS_LABEL[a.status]}
            </Badge>
            <span
              className="flex items-center gap-1 text-caption text-muted"
              aria-label={`지금 보는 사람 ${s.watchers}명`}
            >
              <Eye className="size-3.5" aria-hidden />
              {s.watchers}
            </span>
          </div>
          <div>
            <p className="text-body-strong">{s.product.artistName ?? '작자 미상'}</p>
            <h1 className="text-h1">
              <Link href={`/products/${s.product.id}`} className="hover:underline">
                {s.product.title}
              </Link>
            </h1>
          </div>

          <section aria-label="경매 현황" className="border-y border-border py-5">
            <p className="text-small text-muted">
              {a.bidCount > 0 ? (a.status === 'LIVE' ? '현재가' : '낙찰가') : '시작가'}
            </p>
            <p
              aria-live="polite"
              className={cn(
                'tabular -mx-1 rounded-sm px-1 text-display transition-colors',
                flash && 'animate-price-flash',
              )}
            >
              {formatPrice(a.currentPrice)}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-small">
              <div>
                <dt className="text-muted">{a.status === 'SCHEDULED' ? '시작까지' : '남은 시간'}</dt>
                <dd className="text-h3">
                  <AuctionCountdown endsAt={a.endsAt} startsAt={a.startsAt} status={a.status} compact />
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-muted">
                  <Gavel className="size-3.5" aria-hidden />
                  입찰
                </dt>
                <dd className="tabular text-h3">{a.bidCount}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-muted">
                  <Users className="size-3.5" aria-hidden />
                  참여자
                </dt>
                <dd className="tabular text-h3">{a.bidderCount}</dd>
              </div>
            </dl>
            {a.status === 'LIVE' && (
              <p className="mt-3 text-caption text-muted">
                종료{' '}
                {new Date(a.endsAt).toLocaleString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {a.autoExtend && ` · 마감 ${a.extensionWindowSec}초 이내 입찰 시 ${a.extensionSec}초 연장`}
              </p>
            )}
          </section>

          {outbid && (
            <Alert tone="warning" title="더 높은 입찰이 있어요">
              내 최고 입찰 {formatPrice(s.myLastBid!)} · 다시 입찰해 보세요.
            </Alert>
          )}
          {timeUp && <Alert>경매가 마감되었습니다. 낙찰자를 확정하는 중이에요…</Alert>}
          {a.status === 'ENDED' && (
            <Alert
              tone={won ? 'success' : 'info'}
              title={
                won ? '낙찰을 축하합니다' : a.result === 'SOLD' ? '경매가 종료되었습니다' : '유찰되었습니다'
              }
            >
              {won
                ? '72시간 안에 결제를 완료해주세요.'
                : a.result === 'SOLD'
                  ? `최종 낙찰가 ${formatPrice(a.currentPrice)}`
                  : '입찰 없이 종료되었어요.'}
            </Alert>
          )}
          {won && (
            <Button asChild size="lg" block>
              <Link href="/my/wins">결제하러 가기</Link>
            </Button>
          )}

          {a.status === 'LIVE' && <div className="hidden md:block">{panel}</div>}
          {a.status === 'SCHEDULED' && <Alert>경매가 시작되면 입찰할 수 있어요.</Alert>}

          <section aria-labelledby="bid-history">
            <h2 id="bid-history" className="mb-3 text-h3">
              입찰 기록
            </h2>
            {bids.length === 0 ? (
              <p className="text-small text-muted">아직 입찰이 없습니다. 첫 입찰자가 되어보세요.</p>
            ) : (
              <ol className="divide-y divide-border-soft" aria-live="polite">
                {bids.map((b, i) => (
                  <li
                    key={b.id}
                    className={cn(
                      'flex items-center justify-between py-2.5 text-small',
                      i === 0 && a.status === 'LIVE' && 'font-semibold',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {b.bidderMasked}
                      {b.isMine && <Badge tone="primary">나</Badge>}
                      {b.isBuyNow && <Badge tone="solid">즉시 구매</Badge>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular">{formatPrice(b.amount)}</span>
                      <time className="w-14 text-right text-caption text-muted" dateTime={b.createdAt}>
                        {formatRelativeTime(b.createdAt)}
                      </time>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {a.description && <p className="text-small whitespace-pre-wrap text-muted">{a.description}</p>}
        </div>
      </div>

      {/* 모바일: 하단 고정 입찰 바 + 입찰 바텀시트 */}
      {a.status === 'LIVE' && (
        <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-border bg-background px-4 py-2 md:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted">최소 입찰가</p>
            <p className="tabular text-price">{formatPrice(a.minNextBid)}</p>
          </div>
          <Button size="lg" disabled={closed} onClick={() => setSheet(true)} className="flex-1">
            입찰하기
          </Button>
        </div>
      )}
      <Sheet open={sheet} onOpenChange={setSheet} side="bottom" title="입찰하기">
        <BidPanel
          auction={a}
          closed={closed}
          onPlaced={() => {
            setSheet(false);
            void refetch();
          }}
        />
      </Sheet>
    </div>
  );
}
