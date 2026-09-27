import type { Metadata } from 'next';
import { ORDER_LIST_FILTERS, type OrderListQuery } from '@shop/shared';
import { RequireAuth } from '@/components/auth/require-auth';
import { OrderList } from '@/components/order/order-list';

export const metadata: Metadata = { title: '구매 내역', robots: { index: false } };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const initial = (ORDER_LIST_FILTERS as readonly string[]).includes(filter ?? '')
    ? (filter as OrderListQuery['filter'])
    : 'all';
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <h1 className="mb-6 text-h1">구매 내역</h1>
      <RequireAuth>
        <OrderList as="buyer" initialFilter={initial} />
      </RequireAuth>
    </div>
  );
}
