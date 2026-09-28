import { createRealtime, type RealtimeSocket } from '@shop/api-client';
import { useAuthStore } from '@/stores/auth';
import { env } from './env';

let socket: RealtimeSocket | null = null;
let lastToken: string | null = null;

/** 앱 전체에서 실시간 연결 하나를 공유한다. 로그인 상태가 바뀌면 새 토큰으로 다시 연결한다 */
export function getRealtime(): RealtimeSocket {
  if (!socket) {
    socket = createRealtime(env.wsUrl, () => useAuthStore.getState().accessToken);
    socket.connect();
    lastToken = useAuthStore.getState().accessToken;
    useAuthStore.subscribe((s) => {
      if (s.accessToken === lastToken) return;
      lastToken = s.accessToken;
      socket?.disconnect().connect();
    });
  }
  return socket;
}
