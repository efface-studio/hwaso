import { createHttp, type HttpConfig } from './http';
import { authApi } from './endpoints/auth';
import { chatApi, safetyApi } from './endpoints/chat';
import { auctionsApi } from './endpoints/auctions';
import { marketApi } from './endpoints/market';
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
    time: () => http.get<{ serverTime: string }>('/time'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
