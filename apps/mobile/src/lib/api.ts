import { ApiError, createApiClient } from '@shop/api-client';
import { withDemo } from '@/demo/demo-fetch';
import { EPHEMERAL_KEY, REFRESH_KEY, useAuthStore } from '@/stores/auth';
import { env } from './env';
import { biometricKey, requestReauth } from './reauth';
import { secure } from './secure';
import { uploadAwareFetch } from './upload-fetch';

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
  // 결제·정산 계좌 변경 등에서 서버가 본인 확인을 요구하면 확인 창을 띄우고 같은 요청을 다시 보낸다
  reauth: requestReauth,
  // 서버가 꺼져 있을 때 기록한 관리자 계정으로 시연 (개발·시연 빌드에서만)
  // 사진 업로드(FormData)는 XHR 로 — expo/fetch 가 RN 식 파일 첨부를 못 보낸다 (lib/upload-fetch.ts)
  fetch: withDemo(uploadAwareFetch),
});

/** 끝내지 못한(오프라인) 이전 세션 — 다음 실행 때 다시 서버 로그아웃을 보낸다 */
const REVOKE_KEY = 'hwaso.session.revoke';

async function revokeLeftover(refreshToken: string, pushToken?: string) {
  try {
    await api.auth.logout(refreshToken, pushToken);
    await secure.remove(REVOKE_KEY);
  } catch {
    await secure.set(REVOKE_KEY, JSON.stringify({ refreshToken, pushToken })).catch(() => undefined);
  }
}

/**
 * 앱 시작 때 한 번: 저장된 세션을 이어 쓴다.
 * 자동 로그인을 끄고 로그인한 세션이면 이어 쓰지 않는다 — 기기에서 지우고, 서버 세션과 이 기기 푸시도 끝낸다
 * (로그아웃 요청은 기다리지 않는다. 오프라인이면 다음 실행 때 다시 보낸다)
 */
export async function restoreSession(): Promise<void> {
  const leftover = await secure.get(REVOKE_KEY);
  if (leftover) {
    try {
      const prev = JSON.parse(leftover) as { refreshToken: string; pushToken?: string };
      void revokeLeftover(prev.refreshToken, prev.pushToken);
    } catch {
      await secure.remove(REVOKE_KEY);
    }
  }
  if (await secure.get(EPHEMERAL_KEY)) {
    const token = await secure.get(REFRESH_KEY);
    const push = await import('./push').then((m) => m.takeSavedPushToken()).catch(() => null);
    await useAuthStore.getState().clear();
    if (token) void revokeLeftover(token, push ?? undefined);
    return;
  }
  await refreshAccessToken();
}

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
