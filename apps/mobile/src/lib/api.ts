import { ApiError, createApiClient } from '@shop/api-client';
import { withDemo } from '@/demo/demo-fetch';
import { REFRESH_KEY, useAuthStore } from '@/stores/auth';
import { env } from './env';
import { secure } from './secure';

let inflight: Promise<string | null> | null = null;
/** 앱 시작이 refresh 응답에 오래 묶이지 않게 (서버가 답하지 않으면 5초 뒤 포기) */
const REFRESH_TIMEOUT_MS = 5_000;

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
  // React Native 의 AbortSignal 에는 timeout() 이 없어 직접 끊는다
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
  try {
    const tokens = await api.auth.refresh(token, ctrl.signal);
    await useAuthStore.getState().setSession(tokens);
    return tokens.accessToken;
  } catch (e) {
    // 서버가 토큰을 거절했을 때만 세션을 지운다. 네트워크 오류·시간 초과는 refresh 토큰을 남겨 다음에 다시 시도
    if (e instanceof ApiError && (e.status === 401 || e.status === 403))
      await useAuthStore.getState().clear();
    else useAuthStore.getState().markReady();
    return null;
  } finally {
    clearTimeout(timer);
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
