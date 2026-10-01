'use client';

import type { AuthProvider, AuthTokens } from '@shop/shared';
import { useAuthStore } from '@/stores/auth';
import { api } from './api';
import { env } from './env';
import { safeNext, saveOAuthIntent } from './redirect';

export { safeNext } from './redirect';

/** "로그인 상태 유지" 선택 (끈 경우만 '0'). 로그인 화면에서 고르고, 소셜 로그인 복귀·가입 완료에서도 따른다 */
const KEEP_SIGNED_IN_KEY = 'hwaso.keepSignedIn';
/** "아이디 저장" — 다음 로그인 때 이메일을 채워 둔다 */
const SAVED_EMAIL_KEY = 'hwaso.savedEmail';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장소 차단 — 기억하지 않고 동작
  }
}

export const keepSignedIn = () => read(KEEP_SIGNED_IN_KEY) !== '0';
export const setKeepSignedIn = (on: boolean) => write(KEEP_SIGNED_IN_KEY, on ? null : '0');
export const savedEmail = () => read(SAVED_EMAIL_KEY);
export const setSavedEmail = (email: string | null) => write(SAVED_EMAIL_KEY, email);

export function completeLogin(tokens: Pick<AuthTokens, 'accessToken' | 'user'>) {
  useAuthStore.getState().setSession(tokens);
  // 로그인 상태 유지를 껐으면 refresh 쿠키를 브라우저를 닫으면 사라지는 세션 쿠키로 바꾼다.
  // 실패해도 로그인은 그대로다 (쿠키가 30일짜리로 남을 뿐)
  if (!keepSignedIn()) void api.auth.setSessionPersistence(false).catch(() => undefined);
}

export async function logout() {
  try {
    await api.auth.logout();
  } finally {
    useAuthStore.getState().clear();
  }
}

/** provider 가 돌아올 웹 주소. Apple 은 form_post 라 서버 라우트가 받는다 */
export function oauthRedirectUri(provider: AuthProvider): string {
  return provider === 'APPLE'
    ? `${env.siteUrl}/api/auth/apple`
    : `${env.siteUrl}/auth/callback/${provider.toLowerCase()}`;
}

/** 로그인(mode=login) 또는 설정에서 계정 연결(mode=link) 시작 */
export async function startOAuth(provider: AuthProvider, mode: 'login' | 'link', next?: string) {
  const { url, state } = await api.auth.oauthUrl(provider, { redirectUri: oauthRedirectUri(provider) });
  // 이 탭에서 시작한 요청의 state 를 기억해 콜백에서 대조한다 (남이 만든 code/state 링크로 로그인되지 않게)
  saveOAuthIntent({ mode, next: safeNext(next), state });
  window.location.assign(url);
}
