'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CHAT_UNREAD_KEY, NOTI_UNREAD_KEY } from '@/lib/realtime-sync';
import { useAuthStore } from '@/stores/auth';

/** 실시간 이벤트로 갱신되므로 주기적 폴링은 길게 둔다 (재연결 누락 대비) */
export function useUnreadCounts() {
  const enabled = !!useAuthStore((s) => s.user);
  const noti = useQuery({
    queryKey: NOTI_UNREAD_KEY,
    queryFn: api.notifications.unreadCount,
    enabled,
    refetchInterval: 120_000,
  });
  const chat = useQuery({
    queryKey: CHAT_UNREAD_KEY,
    queryFn: api.chat.unreadCount,
    enabled,
    refetchInterval: 120_000,
  });
  return { notifications: noti.data?.unreadCount ?? 0, chat: chat.data?.unreadCount ?? 0 };
}

export function CountBadge({ n, className = 'top-1 right-1' }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span
      aria-hidden
      className={`tabular absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ${className}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}
