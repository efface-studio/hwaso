import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { ServerToClientEvents } from '@shop/shared';
import { useAuthStore } from '@/stores/auth';
import { checkIntegrity } from './integrity';
import { listenNotificationTaps, registerPush, setCurrentPath } from './push';
import { getRealtime } from './realtime';

/** 앱 시작 직후 — 저장된 로그인 상태를 아직 복구하지 않았다 */
const STARTUP = Symbol('startup');

/**
 * 앱 전역 동기화: 로그인하면(이미 알림을 허용한 기기만) 푸시 등록, 알림을 누르면 해당 화면으로,
 * 실시간 이벤트로 채팅·알림·주문 목록과 배지를 갱신한다. 로그인하지 않은 동안은 아무것도 등록하지 않는다.
 */
export function AppSync() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  // 약관 동의 전에는 서버가 쓰기 요청(푸시 토큰 등록)을 막는다
  const consentPending = useAuthStore((s) => !!s.user?.consentRequired);
  const pathname = usePathname();

  useEffect(() => setCurrentPath(pathname), [pathname]);
  useEffect(() => listenNotificationTaps(), []);
  useEffect(() => {
    if (userId && !consentPending) void registerPush().catch(() => undefined);
  }, [userId, consentPending]);
  // 기기 무결성 확인은 로그인한 뒤 실행마다 한 번 (동의 전에도 — 서버 기록은 동의 예외)
  useEffect(() => {
    if (userId) void checkIntegrity();
  }, [userId]);

  // 로그인·로그아웃하면 둘러보며 받아 둔 목록·상세(관심 여부·내 작품 여부 등)를 새 계정 기준으로 다시 받고,
  // 로그아웃이면 이전 계정의 개인 데이터(주문·채팅 등)를 캐시에서 지운다
  const ready = useAuthStore((s) => s.ready);
  const prevUser = useRef<string | undefined | typeof STARTUP>(STARTUP);
  useEffect(() => {
    if (!ready) return;
    if (prevUser.current === STARTUP) {
      // 앱 시작 때 로그인 상태를 복구한 것은 계정 전환이 아니다. 홈은 복구를 기다렸다 받으므로 다시 받지 않고,
      // 복구 전에 손님으로 받아 둔 것(딥 링크로 연 작품 등)만 다시 받는다
      prevUser.current = userId;
      if (userId) void qc.invalidateQueries({ predicate: (q) => q.state.dataUpdatedAt > 0 });
      return;
    }
    if (prevUser.current === userId) return;
    const loggedOut = !!prevUser.current && !userId;
    prevUser.current = userId;
    if (loggedOut) qc.removeQueries({ type: 'inactive' });
    void qc.invalidateQueries();
  }, [ready, userId, qc]);

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
