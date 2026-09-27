'use client';

import {
  REPORT_REASON_LABEL,
  REPORT_STATUSES,
  REPORT_TARGETS,
  type AdminReportRow,
  type ReportAction,
} from '@shop/shared';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { AdminList, dt, useAdminAction, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/choice';
import { Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api';

const TARGET = { PRODUCT: '작품', USER: '사용자', REVIEW: '후기', MESSAGE: '메시지' } as const;
const STATUS = { OPEN: '접수', IN_REVIEW: '확인 중', RESOLVED: '조치 완료', REJECTED: '반려' } as const;
const ACTIONS: Record<ReportAction, string> = {
  none: '조치 없음',
  hide_product: '작품 운영 비공개',
  suspend_user: '작성자·판매자 이용 정지',
  delete_message: '메시지 삭제',
  delete_review: '후기 삭제',
};
const ALLOWED: Record<keyof typeof TARGET, ReportAction[]> = {
  PRODUCT: ['none', 'hide_product', 'suspend_user'],
  USER: ['none', 'suspend_user'],
  REVIEW: ['none', 'delete_review', 'suspend_user'],
  MESSAGE: ['none', 'delete_message', 'suspend_user'],
};
const link = (r: AdminReportRow) =>
  r.targetType === 'PRODUCT'
    ? `/products/${r.targetId}`
    : r.targetType === 'USER'
      ? `/users/${r.targetId}`
      : r.targetOwner
        ? `/users/${r.targetOwner.id}`
        : null;

function Resolve({ r, onClose }: { r: AdminReportRow; onClose: () => void }) {
  const [status, setStatus] = useState<'IN_REVIEW' | 'RESOLVED' | 'REJECTED'>('RESOLVED');
  const [action, setAction] = useState<ReportAction>('none');
  const [resolution, setResolution] = useState('');
  const run = useAdminAction(
    () =>
      api.admin.resolveReport(r.id, { status, resolution, action: status === 'RESOLVED' ? action : 'none' }),
    '신고를 처리했어요',
    ['reports', 'dashboard', 'products', 'users'],
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="신고 처리"
      description={`${TARGET[r.targetType]} · ${REPORT_REASON_LABEL[r.reason]} · 같은 대상 신고 ${r.sameTargetCount}건`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={run.isPending} onClick={() => run.mutate(undefined, { onSuccess: onClose })}>
            처리
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-small">
        <blockquote className="border-l-2 border-border-strong pl-3">{r.targetPreview}</blockquote>
        {r.detail && <p className="text-muted">신고 내용: {r.detail}</p>}
        <RadioGroup
          aria-label="처리 결과"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'RESOLVED', label: '조치 완료' },
            { value: 'IN_REVIEW', label: '확인 중으로 표시' },
            { value: 'REJECTED', label: '반려 (문제 없음)' },
          ]}
        />
        {status === 'RESOLVED' && (
          <RadioGroup
            aria-label="조치"
            value={action}
            onValueChange={setAction}
            options={ALLOWED[r.targetType].map((a) => ({ value: a, label: ACTIONS[a] }))}
          />
        )}
        <Field label="신고자에게 보일 답변" hint="처리 결과는 같은 대상의 열린 신고 모두에 적용돼요.">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={500}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function Reports() {
  const list = useAdminList<AdminReportRow>('reports', api.admin.reports, { status: 'OPEN' });
  const [target, setTarget] = useState<AdminReportRow | null>(null);
  return (
    <>
      <AdminList
        list={list}
        rowKey={(r) => r.id}
        searchPlaceholder="대상 ID · 신고 내용"
        filters={[
          {
            key: 'status',
            label: '상태',
            options: REPORT_STATUSES.map((s) => ({ value: s, label: STATUS[s] })),
          },
          {
            key: 'targetType',
            label: '대상',
            options: REPORT_TARGETS.map((t) => ({ value: t, label: TARGET[t] })),
          },
        ]}
        columns={[
          {
            key: 'target',
            header: '대상',
            cell: (r) => {
              const href = link(r);
              return (
                <span className="flex flex-col">
                  <span className="text-caption text-muted">
                    {TARGET[r.targetType]}
                    {r.targetOwner ? ` · ${r.targetOwner.nickname}` : ''}
                  </span>
                  {href ? (
                    <Link href={href} target="_blank" className="line-clamp-2 max-w-72 hover:underline">
                      {r.targetPreview}
                    </Link>
                  ) : (
                    <span className="line-clamp-2 max-w-72">{r.targetPreview}</span>
                  )}
                </span>
              );
            },
          },
          {
            key: 'reason',
            header: '사유',
            cell: (r) => (
              <span className="flex flex-col">
                <span>{REPORT_REASON_LABEL[r.reason]}</span>
                {r.detail && (
                  <span className="line-clamp-1 max-w-48 text-caption text-muted">{r.detail}</span>
                )}
              </span>
            ),
          },
          {
            key: 'count',
            header: '누적',
            cell: (r) =>
              r.sameTargetCount > 1 ? <Badge tone="destructive">{r.sameTargetCount}</Badge> : '1',
          },
          { key: 'reporter', header: '신고자', cell: (r) => r.reporter.nickname },
          {
            key: 'status',
            header: '상태',
            cell: (r) => (
              <Badge tone={r.status === 'OPEN' ? 'destructive' : 'neutral'}>{STATUS[r.status]}</Badge>
            ),
          },
          { key: 'created', header: '접수', cell: (r) => dt(r.createdAt) },
          {
            key: 'act',
            header: '',
            cell: (r) =>
              r.status === 'OPEN' || r.status === 'IN_REVIEW' ? (
                <Button size="sm" variant="ghost" onClick={() => setTarget(r)}>
                  처리
                </Button>
              ) : null,
          },
        ]}
      />
      {target && <Resolve r={target} onClose={() => setTarget(null)} />}
    </>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminPage title="신고" description="같은 대상의 신고는 한 번에 처리돼요. 조치는 감사 로그에 남아요.">
      <Suspense>
        <Reports />
      </Suspense>
    </AdminPage>
  );
}
