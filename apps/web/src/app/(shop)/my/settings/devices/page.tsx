'use client';

import { ApiError } from '@shop/api-client';
import { formatRelativeTime } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Smartphone } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/display';
import { Breadcrumb } from '@/components/ui/navigation';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다.');

/** 기기(세션) 관리: 목록 ↔ 개별 로그아웃 ↔ 다른 기기 모두 로그아웃 (docs/AUTH.md §6) */
function Devices() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['sessions'], queryFn: api.auth.sessions });
  const refresh = () => qc.invalidateQueries({ queryKey: ['sessions'] });
  const revoke = useMutation({
    mutationFn: api.auth.revokeSession,
    onSuccess: () => {
      toast.show('해당 기기에서 로그아웃했어요');
      void refresh();
    },
    onError: (e) => toast.error(msg(e)),
  });
  const revokeOthers = useMutation({
    mutationFn: api.auth.revokeOtherSessions,
    onSuccess: () => {
      toast.show('다른 기기에서 모두 로그아웃했어요');
      void refresh();
    },
    onError: (e) => toast.error(msg(e)),
  });

  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <Breadcrumb
        items={[
          { href: '/my', label: '마이' },
          { href: '/my/settings', label: '설정' },
          { label: '기기 관리' },
        ]}
      />
      <div className="mt-4 flex items-end justify-between gap-4">
        <h1 className="text-h1">로그인된 기기</h1>
        {(data?.length ?? 0) > 1 && (
          <Button
            variant="outline"
            size="sm"
            loading={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            다른 기기 모두 로그아웃
          </Button>
        )}
      </div>
      <p className="mt-1 text-small text-muted">모르는 기기가 있다면 로그아웃하고 비밀번호를 바꿔주세요.</p>

      <ul className="mt-6 divide-y divide-border-soft border-y border-border-soft">
        {isPending &&
          Array.from({ length: 2 }, (_, i) => (
            <li key={i} className="py-4">
              <Skeleton className="h-10 w-full" />
            </li>
          ))}
        {data?.map((s) => (
          <li key={s.id} className="flex items-center gap-4 py-4">
            {s.platform === 'web' ? (
              <Monitor className="size-6 shrink-0 text-muted" aria-hidden />
            ) : (
              <Smartphone className="size-6 shrink-0 text-muted" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-body-strong">
                <span className="truncate">{s.deviceName}</span>
                {s.current && <Badge tone="primary">현재 기기</Badge>}
              </p>
              <p className="text-small text-muted">
                {s.ipMasked} · 최근 사용 {formatRelativeTime(s.lastUsedAt)}
              </p>
            </div>
            {!s.current && (
              <Button
                variant="ghost"
                size="sm"
                loading={revoke.isPending && revoke.variables === s.id}
                onClick={() => revoke.mutate(s.id)}
              >
                로그아웃
              </Button>
            )}
          </li>
        ))}
      </ul>
      {data?.length === 0 && <EmptyState title="로그인된 기기가 없습니다" />}
    </div>
  );
}

export default function DevicesPage() {
  return (
    <RequireAuth>
      <Devices />
    </RequireAuth>
  );
}
