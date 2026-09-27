import { createHttp, type HttpConfig } from './http';
import { authApi } from './endpoints/auth';
import { marketApi } from './endpoints/market';

export type { UploadedImage } from './endpoints/market';
export { ApiError, buildQuery, createHttp, type Http, type HttpConfig, type Query } from './http';

export function createApiClient(config: HttpConfig) {
  const http = createHttp(config);
  return {
    http,
    auth: authApi(http),
    market: marketApi(http),
    time: () => http.get<{ serverTime: string }>('/time'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
