import { createApiClient } from '@shop/api-client';
import { useAuthStore } from '@/stores/auth';
import { env } from './env';

let inflight: Promise<string | null> | null = null;

/** 동시에 여러 곳에서 불러도 refresh 요청은 한 번만 보낸다 (rotation 재사용 탐지 오작동 방지) */
function refreshAccessToken(): Promise<string | null> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(): Promise<string | null> {
  try {
    const tokens = await api.auth.refresh();
    useAuthStore.getState().setSession(tokens);
    return tokens.accessToken;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

export const api = createApiClient({
  baseUrl: env.apiUrl,
  credentials: 'include',
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: refreshAccessToken,
});

export { refreshAccessToken };
