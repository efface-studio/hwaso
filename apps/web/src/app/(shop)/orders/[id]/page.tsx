import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { OrderDetail } from '@/components/order/order-detail';

export const metadata: Metadata = { title: '주문 상세', robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <h1 className="mb-6 text-h1">주문 상세</h1>
      <RequireAuth>
        <Suspense>
          <OrderDetail id={id} />
        </Suspense>
      </RequireAuth>
    </div>
  );
}
