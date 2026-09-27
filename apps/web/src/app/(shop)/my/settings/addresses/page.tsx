import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/require-auth';
import { AddressList } from '@/components/order/address';

export const metadata: Metadata = { title: '배송지 관리', robots: { index: false } };

export default function AddressesPage() {
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <h1 className="mb-6 text-h1">배송지 관리</h1>
      <RequireAuth>
        <AddressList />
      </RequireAuth>
    </div>
  );
}
