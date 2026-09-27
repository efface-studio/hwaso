import {
  ORDER_STATUS_LABEL,
  formatPrice,
  type OrderItemDto,
  type OrderQuoteDto,
  type OrderStatus,
} from '@shop/shared';
import Link from 'next/link';
import { MediaImage } from '@/components/product/media-image';
import { Badge, type BadgeTone } from '@/components/ui/display';
import { cn } from '@/lib/cn';

const TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: 'outline',
  PAYMENT_PENDING: 'destructive',
  PAID: 'primary',
  PREPARING: 'primary',
  SHIPPED: 'primary',
  DELIVERED: 'primary',
  COMPLETED: 'neutral',
  CANCELLED: 'outline',
  REFUND_REQUESTED: 'destructive',
  REFUNDED: 'outline',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

/** 결제 완료 → 배송 준비 → 배송 중 → 배송 완료 → 구매 확정 */
const STEPS: OrderStatus[] = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];

export function OrderSteps({ status }: { status: OrderStatus }) {
  const at = STEPS.indexOf(status === 'REFUND_REQUESTED' ? 'DELIVERED' : status);
  if (at < 0) return null;
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="주문 진행 단계">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined} className="flex flex-col gap-1.5">
          <span className={cn('h-1 rounded-full', i <= at ? 'bg-primary' : 'bg-surface-2')} />
          <span className={cn('text-caption', i === at ? 'font-semibold text-foreground' : 'text-muted')}>
            {ORDER_STATUS_LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OrderItemRow({ item, compact }: { item: OrderItemDto; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/products/${item.productId}`}
        className={cn('shrink-0 bg-background-soft', compact ? 'size-14' : 'size-20')}
      >
        <MediaImage image={item.image} alt="" sizes="80px" className="p-1" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/products/${item.productId}`} className="line-clamp-2 text-body hover:underline">
          {item.title}
        </Link>
        <p className="tabular mt-0.5 text-small text-muted">
          {formatPrice(item.unitPrice)}
          {item.quantity > 1 && ` × ${item.quantity}`}
        </p>
      </div>
    </div>
  );
}

export function AmountSummary({
  q,
  className,
}: {
  q: Pick<OrderQuoteDto, 'itemsAmount' | 'shippingFee' | 'discountAmount' | 'totalAmount'>;
  className?: string;
}) {
  const row = (label: string, v: string, strong?: boolean) => (
    <div className={cn('flex justify-between', strong ? 'text-body-strong' : 'text-small')}>
      <dt className={strong ? undefined : 'text-muted'}>{label}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
  return (
    <dl className={cn('flex flex-col gap-2', className)}>
      {row('작품 금액', formatPrice(q.itemsAmount))}
      {row('배송비', q.shippingFee ? formatPrice(q.shippingFee) : '무료')}
      {q.discountAmount > 0 && row('쿠폰 할인', `−${formatPrice(q.discountAmount)}`)}
      <div className="my-1 border-t border-border" />
      {row('총 결제 금액', formatPrice(q.totalAmount), true)}
    </dl>
  );
}
