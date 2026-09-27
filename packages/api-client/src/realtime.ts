import { RT_NAMESPACE, type ClientToServerEvents, type ServerToClientEvents } from '@shop/shared';
import { io, type Socket } from 'socket.io-client';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * 실시간 연결 (web·mobile 공용). 자동 재연결은 Socket.IO 가 지수 백오프로 처리하고,
 * 재연결될 때마다 최신 access 토큰으로 다시 인증한다.
 */
export function createRealtime(origin: string, getToken: () => string | null): RealtimeSocket {
  return io(`${origin}${RT_NAMESPACE}`, {
    transports: ['websocket'],
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    auth: (cb) => cb({ token: getToken() }),
  });
}
