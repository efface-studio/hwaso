'use client';

import { ApiError } from '@shop/api-client';
import { NOTIFICATION_TYPE_LABEL, formatRelativeTime, type NotificationDto } from '@shop/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { NOTI_UNREAD_KEY } from '@/lib/realtime-sync';
import { toast } from '@/stores/toast';

const LIST_KEY = ['notifications', 'list'] as const;

function Inbox() {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useInfiniteQuery({
    queryKey: LIST_KEY,
    queryFn: ({ pageParam }) => api.notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const sync = (unreadCount?: number) => {
    if (unreadCount !== undefined) qc.setQueryData(NOTI_UNREAD_KEY, { unreadCount });
    void qc.invalidateQueries({ queryKey: LIST_KEY });
  };
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : '처리하지 못했습니다.');
  const readAll = useMutation({
    mutationFn: () => api.notifications.read({ all: true }),
    onSuccess: (r) => sync(r.unreadCount),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.notifications.remove(id),
    onSuccess: (r) => sync(r.unreadCount),
    onError,
  });
  const clear = useMutation({ mutationFn: api.notifications.clearRead, onSuccess: () => sync(), onError });

  const open = (n: NotificationDto) => {
    if (!n.readAt) void api.notifications.read({ ids: [n.id] }).then((r) => sync(r.unreadCount));
    if (n.link) router.push(n.link);
  };

  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!items.some((n) => !n.readAt)}
          loading={readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          모두 읽음
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!items.some((n) => n.readAt)}
          onClick={() => confirm('읽은 알림을 모두 지울까요?') && clear.mutate()}
        >
          읽은 알림 삭제
        </Button>
      </div>
      {!items.length ? (
        <EmptyState
          icon={<Bell />}
          title="새 알림이 없어요"
          description="입찰·주문·문의 소식이 생기면 여기에 모여요."
        />
      ) : (
        <ul className="divide-y divide-border-soft border-y border-border-soft">
          {items.map((n) => (
            <li key={n.id} className={cn('flex items-start gap-3 py-4', !n.readAt && 'bg-primary-soft/40')}>
              <button
                type="button"
                onClick={() => open(n)}
                className="flex min-w-0 flex-1 items-start gap-3 px-2 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-2 size-2 shrink-0 rounded-full',
                    n.readAt ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-muted">
                    {NOTIFICATION_TYPE_LABEL[n.type]} · {formatRelativeTime(n.createdAt)}
                  </span>
                  <span className="block text-body-strong">{n.title}</span>
                  {n.body && <span className="block text-small text-muted">{n.body}</span>}
                </span>
              </button>
              <button
                type="button"
                aria-label="알림 삭제"
                onClick={() => remove.mutate(n.id)}
                className="p-2 text-faint hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          더 보기
        </Button>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-h1">알림</h1>
        <Link
          href="/my/settings/notifications"
          aria-label="알림 설정"
          className="p-2 text-muted hover:text-foreground"
        >
          <Settings className="size-5" aria-hidden />
        </Link>
      </div>
      <RequireAuth>
        <Inbox />
      </RequireAuth>
    </div>
  );
}
