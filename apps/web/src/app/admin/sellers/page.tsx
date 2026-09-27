'use client';

import { Suspense } from 'react';
import { AdminPage } from '@/components/admin/admin-shell';
import { UserTable } from '@/components/admin/user-table';

export default function AdminSellersPage() {
  return (
    <AdminPage
      title="판매자 인증"
      description="정산 계좌를 등록한 판매자를 확인하고 인증 판매자 표시를 부여해요."
    >
      <Suspense>
        <UserTable mode="sellers" />
      </Suspense>
    </AdminPage>
  );
}
