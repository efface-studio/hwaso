'use client';

import type { AuditLogRow } from '@shop/shared';
import { Suspense } from 'react';
import { AdminList, dt, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { api } from '@/lib/api';

const TYPES = [
  'USER',
  'PRODUCT',
  'ORDER',
  'AUCTION',
  'SETTLEMENT',
  'COUPON',
  'REPORT',
  'CATEGORY',
  'BANNER',
  'NOTICE',
  'NOTIFICATION',
  'AUCTION_POLICY',
  'MESSAGE',
  'REVIEW',
  'SERVER_LOG',
];
const json = (v: unknown) => (v == null ? '' : JSON.stringify(v));

function Logs() {
  const list = useAdminList<AuditLogRow>('audit', api.admin.auditLogs);
  return (
    <AdminList
      list={list}
      rowKey={(l) => l.id}
      searchPlaceholder="대상 ID · 작업명"
      filters={[{ key: 'targetType', label: '대상', options: TYPES.map((t) => ({ value: t, label: t })) }]}
      columns={[
        { key: 'when', header: '시각', cell: (l) => dt(l.createdAt) },
        { key: 'actor', header: '관리자', cell: (l) => l.actor?.nickname ?? '-' },
        { key: 'action', header: '작업', cell: (l) => <code className="text-caption">{l.action}</code> },
        {
          key: 'target',
          header: '대상',
          cell: (l) => (
            <span className="text-caption">
              {l.targetType} · {l.targetId}
            </span>
          ),
        },
        {
          key: 'diff',
          header: '변경',
          cell: (l) => (
            <details className="max-w-80 text-caption">
              <summary className="cursor-pointer text-muted">보기</summary>
              <pre className="mt-1 break-all whitespace-pre-wrap">{`전: ${json(l.before)}\n후: ${json(l.after)}`}</pre>
            </details>
          ),
        },
        { key: 'ip', header: 'IP', cell: (l) => <span className="text-caption">{l.ip ?? '-'}</span> },
      ]}
    />
  );
}

export default function AdminAuditPage() {
  return (
    <AdminPage title="감사 로그" description="관리자의 모든 변경 기록이에요. 삭제·수정할 수 없어요.">
      <Suspense>
        <Logs />
      </Suspense>
    </AdminPage>
  );
}
