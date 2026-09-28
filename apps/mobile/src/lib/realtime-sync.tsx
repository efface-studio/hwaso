import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import type { ServerToClientEvents } from '@shop/shared';
import { useAuthStore } from '@/stores/auth';
import { listenNotificationTaps, registerPush, setCurrentPath } from './push';
import { getRealtime } from './realtime';

/**
 * 앱 전역 동기화: 로그인하면 푸시 등록, 알림을 누르면 해당 화면으로,
 * 실시간 이벤트로 채팅·알림·주문 목록과 배지를 갱신한다.
 */
export function AppSync() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const pathname = usePathname();

  useEffect(() => setCurrentPath(pathname), [pathname]);
  useEffect(() => listenNotificationTaps(), []);
  useEffect(() => {
    if (userId) void registerPush().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const socket = getRealtime();
    const chat: ServerToClientEvents['CHAT_MESSAGE'] = () => {
      void qc.invalidateQueries({ queryKey: ['chat', 'rooms'] });
      void qc.invalidateQueries({ queryKey: ['chat', 'unread'] });
    };
    const read: ServerToClientEvents['CHAT_READ'] = () =>
      void qc.invalidateQueries({ queryKey: ['chat', 'unread'] });
    const noti: ServerToClientEvents['NOTIFICATION'] = ({ unreadCount }) => {
      qc.setQueryData(['notifications', 'unread'], { unreadCount });
      void qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
    };
    const order: ServerToClientEvents['ORDER_STATUS_UPDATED'] = () =>
      void qc.invalidateQueries({ queryKey: ['orders'] });
    socket.on('CHAT_MESSAGE', chat);
    socket.on('CHAT_READ', read);
    socket.on('NOTIFICATION', noti);
    socket.on('ORDER_STATUS_UPDATED', order);
    return () => {
      socket.off('CHAT_MESSAGE', chat);
      socket.off('CHAT_READ', read);
      socket.off('NOTIFICATION', noti);
      socket.off('ORDER_STATUS_UPDATED', order);
    };
  }, [userId, qc]);
  return null;
}
