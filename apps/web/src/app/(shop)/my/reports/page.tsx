'use client';

import { REPORT_REASON_LABEL, type ReportTarget } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';

const TARGET: Record<ReportTarget, string> = {
  PRODUCT: '작품',
  USER: '사용자',
  REVIEW: '후기',
  MESSAGE: '메시지',
};
const STATUS = {
  OPEN: ['접수', 'outline'],
  IN_REVIEW: ['확인 중', 'primary'],
  RESOLVED: ['조치 완료', 'neutral'],
  REJECTED: ['반려', 'outline'],
} as const;

function Reports() {
  const { data, isPending } = useQuery({ queryKey: ['my-reports'], queryFn: api.safety.myReports });
  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<Flag />} title="신고 내역이 없어요" />;
  return (
    <ul className="divide-y divide-border-soft border-y border-border-soft">
      {data.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 py-4">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
            <span className="text-small">
              {TARGET[r.targetType]} · {REPORT_REASON_LABEL[r.reason]}
            </span>
            <span className="ml-auto text-caption text-muted">
              {new Date(r.createdAt).toLocaleDateString('ko-KR')}
            </span>
          </div>
          {r.detail && <p className="text-small text-muted">{r.detail}</p>}
          {r.resolution && <p className="text-small">운영팀 답변: {r.resolution}</p>}
        </li>
      ))}
    </ul>
  );
}

export default function MyReportsPage() {
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <h1 className="mb-6 text-h1">신고 내역</h1>
      <RequireAuth>
        <Reports />
      </RequireAuth>
    </div>
  );
}
