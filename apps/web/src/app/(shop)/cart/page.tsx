'use client';

import { ApiError } from '@shop/api-client';
import { formatPrice, type CartItemDto } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { MediaImage } from '@/components/product/media-image';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/stores/toast';

const CART_KEY = ['cart'] as const;

function groupBySeller(items: CartItemDto[]) {
  const map = new Map<string, CartItemDto[]>();
  for (const i of items) map.set(i.seller.id, [...(map.get(i.seller.id) ?? []), i]);
  return [...map.values()];
}

function Cart() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isPending } = useQuery({ queryKey: CART_KEY, queryFn: api.orders.cart });
  const refresh = () => void qc.invalidateQueries({ queryKey: CART_KEY });
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : '처리하지 못했습니다.');
  const setQty = useMutation({
    mutationFn: ({ id, q }: { id: string; q: number }) => api.orders.putCart(id, q),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.orders.removeCart(id),
    onSuccess: refresh,
    onError,
  });

  if (isPending) return <Skeleton className="h-60 w-full" />;
  if (!data?.length)
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="장바구니가 비어 있어요"
        description="마음에 드는 작품을 담아두고 한 번에 주문하세요."
        action={
          <Button asChild>
            <Link href="/search">작품 둘러보기</Link>
          </Button>
        }
      />
    );

  return (
    <div className="flex flex-col gap-8">
      <p className="text-small text-muted">작품은 판매자별로 따로 주문·배송돼요.</p>
      {groupBySeller(data).map((group) => {
        const seller = group[0]!.seller;
        const buyable = group.filter((i) => i.available);
        const items = buyable.reduce((s, i) => s + (i.product.price ?? 0) * i.quantity, 0);
        const shipping = buyable.reduce((s, i) => s + i.product.shippingFee, 0);
        return (
          <section key={seller.id} className="rounded-sm border border-border">
            <Link
              href={`/users/${seller.id}`}
              className="flex items-center gap-2 border-b border-border px-4 py-3 hover:bg-background-soft"
            >
              <Avatar avatarKey={seller.avatarKey} name={seller.nickname} size="sm" />
              <span className="text-body-strong">{seller.nickname}</span>
            </Link>
            <ul className="divide-y divide-border-soft">
              {group.map((i) => (
                <li key={i.productId} className={cn('flex gap-3 p-4', !i.available && 'opacity-60')}>
                  <Link href={`/products/${i.productId}`} className="size-20 shrink-0 bg-background-soft">
                    <MediaImage image={i.product.image} alt="" sizes="80px" className="p-1" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small text-muted">{i.product.artistName}</p>
                    <Link
                      href={`/products/${i.productId}`}
                      className="line-clamp-2 text-body hover:underline"
                    >
                      {i.product.title}
                    </Link>
                    <p className="tabular mt-1 text-body-strong">
                      {i.product.price != null ? formatPrice(i.product.price) : '-'}
                    </p>
                    {!i.available && <p className="text-small text-destructive">지금은 구매할 수 없어요</p>}
                    {i.available && i.product.stock > 1 && (
                      <div className="mt-2 inline-flex items-center border border-border-strong">
                        <button
                          type="button"
                          aria-label="수량 줄이기"
                          disabled={i.quantity <= 1}
                          onClick={() => setQty.mutate({ id: i.productId, q: i.quantity - 1 })}
                          className="inline-flex size-8 items-center justify-center disabled:opacity-30"
                        >
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span className="tabular w-8 text-center text-small" aria-live="polite">
                          {i.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="수량 늘리기"
                          disabled={i.quantity >= i.product.stock}
                          onClick={() => setQty.mutate({ id: i.productId, q: i.quantity + 1 })}
                          className="inline-flex size-8 items-center justify-center disabled:opacity-30"
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`${i.product.title} 빼기`}
                    onClick={() => remove.mutate(i.productId)}
                    className="-m-2 self-start p-2 text-muted hover:text-foreground"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background-soft px-4 py-3">
              <p className="tabular text-small">
                작품 {formatPrice(items)} + 배송비 {shipping ? formatPrice(shipping) : '무료'} ={' '}
                <strong className="text-body-strong">{formatPrice(items + shipping)}</strong>
              </p>
              <Button
                disabled={!buyable.length}
                onClick={() =>
                  router.push(
                    `/checkout?from=cart&items=${buyable.map((i) => `${i.productId}:${i.quantity}`).join(',')}`,
                  )
                }
              >
                {buyable.length}개 주문하기
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function CartPage() {
  return (
    <div className="page-x mx-auto max-w-3xl py-6 md:py-10">
      <h1 className="mb-6 text-h1">장바구니</h1>
      <RequireAuth>
        <Cart />
      </RequireAuth>
    </div>
  );
}
