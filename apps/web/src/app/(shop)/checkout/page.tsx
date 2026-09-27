import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/require-auth';
import { Checkout, type CheckoutItem } from '@/components/order/checkout';

export const metadata: Metadata = { title: '주문서', robots: { index: false } };

/** ?productId=…&qty=… (바로 구매) 또는 ?items=id:qty,id:qty&from=cart (장바구니) */
function parse(sp: Record<string, string | string[] | undefined>): CheckoutItem[] {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const productId = one(sp.productId);
  if (productId) return [{ productId, quantity: Math.max(1, Number(one(sp.qty)) || 1) }];
  return (one(sp.items) ?? '')
    .split(',')
    .map((s) => s.split(':'))
    .filter(([id]) => id)
    .map(([productId, q]) => ({ productId: productId!, quantity: Math.max(1, Number(q) || 1) }))
    .slice(0, 50);
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const items = parse(sp);
  return (
    <div className="page-x mx-auto max-w-page py-6 md:py-10">
      <h1 className="mb-6 text-h1">주문서</h1>
      {items.length ? (
        <RequireAuth>
          <Checkout items={items} fromCart={sp.from === 'cart'} />
        </RequireAuth>
      ) : (
        <p className="text-body text-muted">주문할 작품이 없습니다.</p>
      )}
    </div>
  );
}
