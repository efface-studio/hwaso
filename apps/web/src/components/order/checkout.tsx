'use client';

import { ApiError } from '@shop/api-client';
import { formatPrice, POLICIES, type PaymentMethod } from '@shop/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/choice';
import { Alert, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { AddressList, useAddresses } from './address';
import { AmountSummary, OrderItemRow } from './order-ui';
import { PayMethodPicker, usePay } from './pay';

export type CheckoutItem = { productId: string; quantity: number };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
      <h2 className="mb-3 text-h3">{title}</h2>
      {children}
    </section>
  );
}

/** 주문서: 작품 확인 → 배송지 → 쿠폰 → 결제 수단 → 동의 → 결제 */
export function Checkout({ items, fromCart }: { items: CheckoutItem[]; fromCart: boolean }) {
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | undefined>();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [agreed, setAgreed] = useState(false);
  const addresses = useAddresses();
  const { pay, paying } = usePay();

  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId(addresses.data[0]!.id);
  }, [addresses.data, addressId]);

  const quote = useQuery({
    queryKey: ['quote', items, coupon],
    queryFn: () => api.orders.quote({ items, couponCode: coupon }),
    retry: false,
  });
  const couponError =
    coupon && quote.error instanceof ApiError && quote.error.code.startsWith('COUPON')
      ? quote.error.message
      : null;

  const place = useMutation({
    mutationFn: () => api.orders.create({ items, addressId: addressId!, couponCode: coupon, fromCart }),
    onSuccess: (o) => void pay(o.id, method),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '주문하지 못했습니다.'),
  });

  if (quote.isPending) return <Skeleton className="h-96 w-full" />;
  if (quote.error && !couponError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert tone="destructive" title="주문할 수 없어요">
          {quote.error instanceof ApiError ? quote.error.message : '잠시 후 다시 시도해주세요.'}
        </Alert>
        <Button asChild variant="outline">
          <Link href={fromCart ? '/cart' : '/'}>{fromCart ? '장바구니로' : '홈으로'}</Link>
        </Button>
      </div>
    );
  }
  const q = quote.data;
  const busy = place.isPending || paying;
  const canPay = !!q && !!addressId && agreed && !busy && !couponError;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        <Section title="주문 작품">
          <ul className="flex flex-col gap-3">
            {q?.items.map((i) => (
              <li key={i.productId}>
                <OrderItemRow item={i} />
              </li>
            ))}
          </ul>
        </Section>
        <Section title="배송지">
          <AddressList selected={addressId} onSelect={setAddressId} />
        </Section>
        <Section title="쿠폰">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setCoupon(couponInput.trim() || undefined);
            }}
          >
            <Input
              aria-label="쿠폰 코드"
              placeholder="쿠폰 코드 입력"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              className="flex-1 uppercase"
            />
            {coupon ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCoupon(undefined);
                  setCouponInput('');
                }}
              >
                해제
              </Button>
            ) : (
              <Button type="submit" variant="outline" disabled={!couponInput.trim()}>
                적용
              </Button>
            )}
          </form>
          {couponError && (
            <p role="alert" className="mt-2 text-small text-destructive">
              {couponError}
            </p>
          )}
          {q?.coupon && <p className="mt-2 text-small text-primary">{q.coupon.name} 적용됨</p>}
        </Section>
        <Section title="결제 수단">
          <PayMethodPicker value={method} onChange={setMethod} />
        </Section>
      </div>

      <aside className="md:sticky md:top-24 md:self-start">
        <div className="flex flex-col gap-4 rounded-sm border border-border p-5">
          {q && <AmountSummary q={q} />}
          <Checkbox
            checked={agreed}
            onCheckedChange={setAgreed}
            label="주문 내용을 확인했으며 결제에 동의합니다 (필수)"
          />
          <p className="text-caption text-muted">
            화소는 통신판매중개자이며 결제 대금은 구매 확정 전까지 안전하게 보관됩니다.{' '}
            <Link href="/terms" className="underline">
              이용약관
            </Link>{' '}
            ·{' '}
            <Link href={POLICIES.refund.path} className="underline">
              {POLICIES.refund.title}
            </Link>
          </p>
          <Button size="lg" block disabled={!canPay} loading={busy} onClick={() => place.mutate()}>
            {q ? `${formatPrice(q.totalAmount)} 결제하기` : '결제하기'}
          </Button>
          {!addressId && <p className="text-small text-muted">배송지를 추가해주세요.</p>}
        </div>
      </aside>
    </div>
  );
}
