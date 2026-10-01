import {
  LOG_NAMESPACE,
  RT_NAMESPACE,
  type ClientToServerEvents,
  type LogClientToServerEvents,
  type LogServerToClientEvents,
  type ServerToClientEvents,
} from '@shop/shared';
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

export type LogStreamSocket = Socket<LogServerToClientEvents, LogClientToServerEvents>;

/**
 * 관리자 실시간 서버 로그 (최고 관리자). 화면에 있는 동안만 연결한다 — autoConnect 를 끄고 화면이 connect/disconnect 한다.
 * 서버는 토큰이 만료되거나 권한이 바뀌면 끊는다(io server disconnect) — 화면은 API 호출로 토큰을 갱신한 뒤 다시 연결한다.
 */
export function createLogStream(origin: string, getToken: () => string | null): LogStreamSocket {
  return io(`${origin}${LOG_NAMESPACE}`, {
    transports: ['websocket'],
    autoConnect: false,
    // 같은 주소의 /rt 연결과 섞이지 않게 따로 연결한다 (화면을 나가면 완전히 닫는다)
    forceNew: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    auth: (cb) => cb({ token: getToken() }),
  });
}
