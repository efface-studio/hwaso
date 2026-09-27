'use client';

import { ApiError } from '@shop/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserX } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

function Blocks() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['blocks'], queryFn: api.safety.blocks });
  const unblock = useMutation({
    mutationFn: (id: string) => api.safety.unblock(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['blocks'] });
      toast.success('차단을 해제했어요');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '해제하지 못했습니다.'),
  });
  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!data?.length)
    return (
      <EmptyState
        icon={<UserX />}
        title="차단한 사용자가 없어요"
        description="채팅방 메뉴에서 사용자를 차단할 수 있어요."
      />
    );
  return (
    <ul className="divide-y divide-border-soft border-y border-border-soft">
      {data.map((u) => (
        <li key={u.id} className="flex items-center gap-3 py-3">
          <Avatar avatarKey={u.avatarKey} name={u.nickname} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body">{u.nickname}</p>
            <p className="text-caption text-muted">
              {new Date(u.blockedAt).toLocaleDateString('ko-KR')} 차단
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            loading={unblock.isPending && unblock.variables === u.id}
            onClick={() => unblock.mutate(u.id)}
          >
            차단 해제
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function BlocksPage() {
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <h1 className="mb-2 text-h1">차단한 사용자</h1>
      <p className="mb-6 text-small text-muted">차단한 사용자와는 채팅을 주고받을 수 없어요.</p>
      <RequireAuth>
        <Blocks />
      </RequireAuth>
    </div>
  );
}
