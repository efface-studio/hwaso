import { createApiClient } from '@shop/api-client';
import { withDemo } from '@/demo/demo-fetch';
import { REFRESH_KEY, useAuthStore } from '@/stores/auth';
import { env } from './env';
import { biometricKey, requestReauth } from './reauth';
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
  // 결제·정산 계좌 변경 등에서 서버가 본인 확인을 요구하면 확인 창을 띄우고 같은 요청을 다시 보낸다
  reauth: requestReauth,
  // 서버가 꺼져 있을 때 기록한 관리자 계정으로 시연 (개발·시연 빌드에서만)
  fetch: withDemo(globalThis.fetch.bind(globalThis)),
});

export async function logout() {
  // 이 기기 푸시 해제 (순환 참조를 피해 동적 import)
  await import('./push').then((m) => m.unregisterPush()).catch(() => undefined);
  const token = await secure.get(REFRESH_KEY);
  await api.auth.logout(token ?? undefined).catch(() => undefined);
  // 이 기기의 생체 인증 본인 확인 키도 지운다 (서버는 세션과 함께 폐기)
  await biometricKey.clear();
  api.setReauthToken(null);
  await useAuthStore.getState().clear();
}
