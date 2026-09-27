import { createApiClient } from '@shop/api-client';
import { useAuthStore } from '@/stores/auth';
import { env } from './env';

async function refreshAccessToken(): Promise<string | null> {
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
