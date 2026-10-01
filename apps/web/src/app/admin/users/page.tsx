'use client';

import { Suspense } from 'react';
import { AdminPage } from '@/components/admin/admin-shell';
import { CreateUserButton } from '@/components/admin/user-forms';
import { UserTable } from '@/components/admin/user-table';

export default function AdminUsersPage() {
  return (
    <AdminPage
      title="회원"
      description="회원을 찾아 정지·해제하고 역할을 관리해요. 모든 조치는 감사 로그에 남아요."
      actions={<CreateUserButton />}
    >
      <Suspense>
        <UserTable mode="users" />
      </Suspense>
    </AdminPage>
  );
}
