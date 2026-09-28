import type { Metadata } from 'next';
import { BidHistory } from '@/components/auction/bid-history';
import { RequireAuth } from '@/components/auth/require-auth';

export const metadata: Metadata = { title: '낙찰 내역', robots: { index: false } };

export default function MyWinsPage() {
  return (
    <RequireAuth>
      <BidHistory wins />
    </RequireAuth>
  );
}
