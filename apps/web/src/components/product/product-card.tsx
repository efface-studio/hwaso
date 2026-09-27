import type { ProductCardDto } from '@shop/shared';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { AuctionCountdown } from './countdown';
import { FavoriteButton } from './favorite-button';
import { MediaImage } from './media-image';
import { PriceTag } from './price';

interface ProductCardProps {
  product: ProductCardDto;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/**
 * 이미지가 카드의 주인공 (docs/DESIGN_SYSTEM.md §11). 텍스트는 작가 → 제목 → 가격 → 상태.
 * 그림자·큰 radius 없이 여백으로 구분한다. 링크 안에 버튼을 넣지 않도록 이미지 링크와 관심 버튼을 형제로 둔다.
 */
export function ProductCard({ product: p, priority, sizes, className }: ProductCardProps) {
  const a = p.auction;
  const href = `/products/${p.id}`;
  return (
    <article
      className={cn(
        'group relative [contain-intrinsic-size:auto_360px] [content-visibility:auto]',
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-background-soft">
        <Link href={href} tabIndex={-1} aria-hidden className="absolute inset-0">
          <MediaImage
            image={p.image}
            alt=""
            sizes={sizes}
            priority={priority}
            className="p-3 transition-transform duration-200 group-hover:scale-[1.02] md:p-4"
          />
        </Link>
        {a?.status === 'LIVE' && (
          <span className="pointer-events-none absolute top-2 left-2 inline-flex h-5 items-center rounded-sm bg-live px-1.5 text-caption font-semibold text-white">
            LIVE
          </span>
        )}
        {a?.status === 'SCHEDULED' && (
          <span className="pointer-events-none absolute top-2 left-2 inline-flex h-5 items-center rounded-sm bg-background px-1.5 text-caption font-semibold">
            경매 예정
          </span>
        )}
        {p.status === 'SOLD' && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 text-label font-semibold">
            판매 완료
          </span>
        )}
        <FavoriteButton productId={p.id} initial={p.isFavorite} />
      </div>
      <Link href={href} className="mt-2.5 flex flex-col gap-0.5 pr-1">
        <span className="truncate text-small font-semibold text-foreground">
          {p.artistName ?? '작자 미상'}
        </span>
        <h3 className="truncate text-small text-foreground-2">{p.title}</h3>
        <PriceTag product={p} className="mt-1.5" />
        {a && (a.status === 'LIVE' || a.status === 'SCHEDULED') && (
          <span className="mt-0.5 flex items-center gap-2 text-caption">
            <AuctionCountdown endsAt={a.endsAt} startsAt={a.startsAt} status={a.status} compact />
            {a.status === 'LIVE' && <span className="text-muted">입찰 {a.bidCount}</span>}
          </span>
        )}
        {p.saleType === 'RESERVATION' && <span className="mt-0.5 text-caption text-muted">예약 판매</span>}
      </Link>
    </article>
  );
}

export function ProductGrid({
  items,
  priorityCount = 0,
}: {
  items: ProductCardDto[];
  priorityCount?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-6 md:grid-cols-3 md:gap-x-4 md:gap-y-8 lg:grid-cols-4">
      {items.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-6 md:grid-cols-3 md:gap-x-4 md:gap-y-8 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2" aria-hidden>
          <div className="aspect-[4/5] animate-pulse bg-background-soft" />
          <div className="h-4 w-1/2 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-4 w-3/4 animate-pulse rounded-sm bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
