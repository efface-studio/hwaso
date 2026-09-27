import {
  formatPrice,
  SALE_TYPE_LABEL,
  VERIFICATION_LABEL,
  type ProductCardDto,
  type VerificationStatus,
} from '@shop/shared';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/display';
import { cn } from '@/lib/cn';

/** 카드·상세 공통 가격 표기. 경매는 현재가(입찰 없으면 시작가) */
export function priceInfo(p: Pick<ProductCardDto, 'saleType' | 'price' | 'status' | 'auction'>): {
  label: string;
  amount: number | null;
} {
  if (p.saleType === 'AUCTION' && p.auction) {
    const { status, bidCount, currentPrice } = p.auction;
    if (status === 'ENDED' || status === 'SETTLED')
      return { label: bidCount > 0 ? '낙찰가' : '유찰', amount: bidCount > 0 ? currentPrice : null };
    if (status === 'SCHEDULED') return { label: '시작가', amount: currentPrice };
    return { label: bidCount > 0 ? '현재가' : '시작가', amount: currentPrice };
  }
  return { label: p.saleType === 'RESERVATION' ? '예약 판매가' : '즉시 구매가', amount: p.price };
}

export function PriceTag({
  product,
  size = 'md',
  className,
}: {
  product: Pick<ProductCardDto, 'saleType' | 'price' | 'status' | 'auction'>;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const { label, amount } = priceInfo(product);
  const sold = product.status === 'SOLD';
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="text-caption text-muted">{sold ? '판매 완료' : label}</span>
      <span
        className={cn(
          'tabular',
          size === 'lg' ? 'text-price-lg' : 'text-price',
          sold && 'text-muted line-through',
        )}
      >
        {amount == null ? '—' : formatPrice(amount)}
      </span>
    </div>
  );
}

export function SaleTypeBadge({
  product,
}: {
  product: Pick<ProductCardDto, 'saleType' | 'auction' | 'status'>;
}) {
  if (product.status === 'SOLD') return <Badge tone="neutral">판매 완료</Badge>;
  if (product.status === 'RESERVED') return <Badge tone="outline">거래 중</Badge>;
  if (product.saleType === 'AUCTION') {
    const s = product.auction?.status;
    if (s === 'LIVE') return <Badge tone="live">LIVE 경매</Badge>;
    if (s === 'SCHEDULED') return <Badge tone="outline">경매 예정</Badge>;
    return <Badge tone="neutral">경매 종료</Badge>;
  }
  return (
    <Badge tone={product.saleType === 'RESERVATION' ? 'outline' : 'neutral'}>
      {SALE_TYPE_LABEL[product.saleType]}
    </Badge>
  );
}

/** 플랫폼이 확인하지 않은 정보를 인증된 것처럼 보이게 하지 않는다 (docs/DESIGN_SYSTEM.md §9) */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === 'VERIFIED') {
    return (
      <Badge tone="primary">
        <ShieldCheck className="size-3" aria-hidden />
        {VERIFICATION_LABEL.VERIFIED}
      </Badge>
    );
  }
  if (status === 'PENDING') return <Badge tone="outline">{VERIFICATION_LABEL.PENDING}</Badge>;
  return null;
}
