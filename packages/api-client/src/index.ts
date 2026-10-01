import { createHttp, type HttpConfig } from './http';
import { adminApi, noticesApi } from './endpoints/admin';
import { authApi } from './endpoints/auth';
import { chatApi, safetyApi } from './endpoints/chat';
import { communityApi } from './endpoints/community';
import { auctionsApi } from './endpoints/auctions';
import { marketApi } from './endpoints/market';
import { meApi } from './endpoints/me';
import { notificationsApi } from './endpoints/notifications';
import { ordersApi } from './endpoints/orders';

export type { UploadedImage } from './endpoints/market';
export type { OrderCounts } from './endpoints/orders';
export type { BlockedUser } from './endpoints/chat';
export { newIdempotencyKey, type BidResult } from './endpoints/auctions';
export { createRealtime, type RealtimeSocket } from './realtime';
export { ApiError, buildQuery, createHttp, type Http, type HttpConfig, type Query } from './http';

export function createApiClient(config: HttpConfig) {
  const http = createHttp(config);
  return {
    http,
    auth: authApi(http),
    market: marketApi(http),
    auctions: auctionsApi(http),
    orders: ordersApi(http),
    notifications: notificationsApi(http),
    chat: chatApi(http),
    safety: safetyApi(http),
    community: communityApi(http),
    admin: adminApi(http),
    notices: noticesApi(http),
    me: meApi(http),
    /** 재인증 토큰 저장 — 만료 전까지 모든 요청에 x-reauth-token 으로 붙는다 (null 이면 지움) */
    setReauthToken: http.setReauthToken,
    time: () => http.get<{ serverTime: string }>('/time'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
