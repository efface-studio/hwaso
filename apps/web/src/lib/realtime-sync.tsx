'use client';

import type { RealtimeSocket } from '@shop/api-client';
import { chatPreview } from '@shop/shared';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

export const NOTI_UNREAD_KEY = ['notifications', 'unread'] as const;
export const CHAT_UNREAD_KEY = ['chat', 'unread'] as const;
export const CHAT_ROOMS_KEY = ['chat', 'rooms'] as const;

/**
 * 로그인 사용자의 개인 룸 이벤트로 배지·목록을 갱신하고, 다른 화면에 있을 때는 토스트로 알린다.
 * 앱 전체에서 한 번만 마운트한다 (providers).
 */
export function RealtimeSync() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    if (!userId) return;
    let socket: RealtimeSocket | null = null;
    let cancelled = false;
    const onNotification = ({
      notification,
      unreadCount,
    }: {
      notification: { title: string; link: string | null };
      unreadCount: number;
    }) => {
      qc.setQueryData(NOTI_UNREAD_KEY, { unreadCount });
      void qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
      if (path.current.startsWith('/notifications')) return;
      if (notification.link) toast.link(notification.title, notification.link);
      else toast.show(notification.title);
    };
    const onChat = (p: {
      roomId: string;
      message: Parameters<typeof chatPreview>[0] & { senderId: string };
    }) => {
      void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY });
      void qc.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
      if (p.message.senderId !== userId && !path.current.startsWith('/chat'))
        toast.link(`새 메시지: ${chatPreview(p.message)}`, `/chat/${p.roomId}`);
    };
    const onRead = () => void qc.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
    const onOrder = () => void qc.invalidateQueries({ queryKey: ['orders'] });
    // socket.io 클라이언트는 로그인 사용자에게만 필요하다 — 공통 번들에서 빼고 이때 불러온다
    void import('./realtime').then(({ getRealtime }) => {
      if (cancelled) return;
      socket = getRealtime();
      socket.on('NOTIFICATION', onNotification);
      socket.on('CHAT_MESSAGE', onChat);
      socket.on('CHAT_READ', onRead);
      socket.on('ORDER_STATUS_UPDATED', onOrder);
    });
    return () => {
      cancelled = true;
      socket?.off('NOTIFICATION', onNotification);
      socket?.off('CHAT_MESSAGE', onChat);
      socket?.off('CHAT_READ', onRead);
      socket?.off('ORDER_STATUS_UPDATED', onOrder);
    };
  }, [userId, qc]);
  return null;
}
