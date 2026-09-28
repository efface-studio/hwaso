'use client';

import { ApiError } from '@shop/api-client';
import { formatPrice, type ProductDetailDto } from '@shop/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gavel, Share2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StartChatButton } from '@/components/chat/start-chat';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { AuctionCountdown } from './countdown';
import { FavoriteButton } from './favorite-button';
import { PriceTag, SaleTypeBadge } from './price';

async function share(title: string) {
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.show('링크를 복사했어요');
  } catch (err) {
    // 사용자가 공유 시트를 닫은 경우는 오류가 아니다
    if ((err as Error).name !== 'AbortError') toast.error('링크를 복사하지 못했습니다.');
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AddToCart({ productId, size }: { productId: string; size: 'md' | 'lg' }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () => api.orders.putCart(productId, 1),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('장바구니에 담았어요');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '담지 못했습니다.'),
  });
  return (
    <Button
      variant="outline"
      size={size}
      loading={add.isPending}
      onClick={() => (user ? add.mutate() : router.push(`/login?next=${encodeURIComponent(pathname)}`))}
    >
      장바구니
    </Button>
  );
}

/** 판매 방식별 CTA. 가격·경매 상태는 서버 값만 표시한다 */
function Cta({ p, compact }: { p: ProductDetailDto; compact?: boolean }) {
  const size = compact ? 'md' : 'lg';
  if (p.isMine) {
    return (
      <Button asChild variant="outline" size={size} block>
        <Link href={`/sell/${p.id}/edit`}>내 상품 관리</Link>
      </Button>
    );
  }
  if (p.status === 'SOLD')
    return (
      <Button size={size} block disabled>
        판매 완료
      </Button>
    );
  if (p.status === 'RESERVED')
    return (
      <Button size={size} block disabled>
        거래 진행 중
      </Button>
    );

  if (p.saleType === 'AUCTION' && p.auction) {
    const a = p.auction;
    if (a.status === 'LIVE' || a.status === 'SCHEDULED') {
      return (
        <Button asChild size={size} block>
          <Link href={`/auctions/${a.id}`}>
            <Gavel className="size-4" aria-hidden />
            {a.status === 'LIVE' ? '경매 참여하기' : '경매 보러가기'}
          </Link>
        </Button>
      );
    }
    return (
      <Button size={size} block disabled>
        경매 종료
      </Button>
    );
  }
  if (p.saleType === 'RESERVATION' && p.availableAt && Date.parse(p.availableAt) > Date.now()) {
    return (
      <Button size={size} block disabled>
        {formatDate(p.availableAt)} 판매 시작
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <AddToCart productId={p.id} size={size} />
      <Button asChild size={size} className="flex-1">
        <Link href={`/checkout?productId=${p.id}`}>구매하기</Link>
      </Button>
    </div>
  );
}

export function PurchasePanel({ product: p }: { product: ProductDetailDto }) {
  const a = p.auction;
  const [reporting, setReporting] = useState(false);
  useEffect(() => {
    void api.market.recordView(p.id).catch(() => undefined);
  }, [p.id]);

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <SaleTypeBadge product={p} />
        </div>

        <div className="flex flex-col gap-1">
          {p.artist ? (
            <Link href={`/artists/${p.artist.id}`} className="text-body-strong hover:underline">
              {p.artist.name}
              {p.artist.nameEn && (
                <span className="ml-2 text-small font-normal text-muted">{p.artist.nameEn}</span>
              )}
            </Link>
          ) : (
            <p className="text-body-strong">{p.artistName ?? '작자 미상'}</p>
          )}
          <h1 className="text-h1">{p.title}</h1>
          <p className="text-small text-muted">{[p.era, p.material].filter(Boolean).join(' · ')}</p>
        </div>

        <div className="border-y border-border py-4">
          <PriceTag product={p} size="lg" />
          {a && a.status === 'LIVE' && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-small">
              <div>
                <dt className="text-muted">남은 시간</dt>
                <dd className="text-body-strong">
                  <AuctionCountdown endsAt={a.endsAt} status={a.status} compact />
                </dd>
              </div>
              <div>
                <dt className="text-muted">입찰</dt>
                <dd className="tabular text-body-strong">{a.bidCount}회</dd>
              </div>
            </dl>
          )}
          {a && a.status === 'SCHEDULED' && (
            <p className="mt-3 text-small">
              <AuctionCountdown endsAt={a.endsAt} startsAt={a.startsAt} status={a.status} />
            </p>
          )}
          {p.saleType !== 'AUCTION' && (
            <p className="mt-2 text-small text-muted">
              배송비 {p.shippingFee === 0 ? '무료' : formatPrice(p.shippingFee)} · {p.shippingMethod}
            </p>
          )}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <FavoriteButton
            productId={p.id}
            initial={p.isFavorite}
            count={p.favoriteCount}
            variant="plain"
            className="border border-border-strong"
          />
          <div className="flex-1">
            <Cta p={p} />
          </div>
          <button
            type="button"
            onClick={() => void share(p.title)}
            aria-label="공유하기"
            className="inline-flex size-12 items-center justify-center rounded-sm border border-border-strong hover:bg-surface-2"
          >
            <Share2 className="size-5" aria-hidden />
          </button>
        </div>
        {!p.isMine && (
          <div className="hidden flex-col gap-2 md:flex">
            <StartChatButton productId={p.id} label="판매자에게 문의하기" size="lg" block />
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="self-end text-caption text-muted underline-offset-2 hover:underline"
            >
              이 작품 신고하기
            </button>
          </div>
        )}
      </div>
      {reporting && <ReportDialog open onOpenChange={setReporting} targetType="PRODUCT" targetId={p.id} />}

      {/* 모바일 하단 고정 CTA 바 (탭 바 위) */}
      <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-border bg-background px-4 py-2 md:hidden">
        <FavoriteButton productId={p.id} initial={p.isFavorite} count={p.favoriteCount} variant="plain" />
        <button
          type="button"
          onClick={() => void share(p.title)}
          aria-label="공유하기"
          className="inline-flex size-11 items-center justify-center"
        >
          <Share2 className="size-5" aria-hidden />
        </button>
        {!p.isMine && <StartChatButton productId={p.id} label="" aria-label="판매자와 채팅" />}
        <div className="flex-1">
          <Cta p={p} compact />
        </div>
      </div>
    </>
  );
}
