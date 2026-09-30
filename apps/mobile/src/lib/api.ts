import { createApiClient } from '@shop/api-client';
import { withDemo } from '@/demo/demo-fetch';
import { REFRESH_KEY, useAuthStore } from '@/stores/auth';
import { env } from './env';
import { secure } from './secure';

let inflight: Promise<string | null> | null = null;

/** refresh 는 동시에 한 번만 (토큰 회전 재사용 탐지 오작동 방지) */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(): Promise<string | null> {
  const token = await secure.get(REFRESH_KEY);
  if (!token) {
    useAuthStore.getState().markReady();
    return null;
  }
  try {
    const tokens = await api.auth.refresh(token);
    await useAuthStore.getState().setSession(tokens);
    return tokens.accessToken;
  } catch {
    await useAuthStore.getState().clear();
    return null;
  }
}

export const api = createApiClient({
  baseUrl: env.apiUrl,
  credentials: 'omit',
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: refreshAccessToken,
  // 서버가 꺼져 있을 때 기록한 관리자 계정으로 시연 (개발·시연 빌드에서만)
  fetch: withDemo(globalThis.fetch.bind(globalThis)),
});

export async function logout() {
  // 이 기기 푸시 해제 (순환 참조를 피해 동적 import)
  await import('./push').then((m) => m.unregisterPush()).catch(() => undefined);
  const token = await secure.get(REFRESH_KEY);
  await api.auth.logout(token ?? undefined).catch(() => undefined);
  await useAuthStore.getState().clear();
}
