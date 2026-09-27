'use client';

import { BidHistory } from '@/components/auction/bid-history';
import { RequireAuth } from '@/components/auth/require-auth';

export default function MyBidsPage() {
  return (
    <RequireAuth>
      <BidHistory wins={false} />
    </RequireAuth>
  );
}
