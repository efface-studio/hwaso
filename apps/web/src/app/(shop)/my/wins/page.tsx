'use client';

import { BidHistory } from '@/components/auction/bid-history';
import { RequireAuth } from '@/components/auth/require-auth';

export default function MyWinsPage() {
  return (
    <RequireAuth>
      <BidHistory wins />
    </RequireAuth>
  );
}
