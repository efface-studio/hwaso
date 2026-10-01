'use client';

import type { AuthProvider, AuthTokens } from '@shop/shared';
import { useAuthStore } from '@/stores/auth';
import { api } from './api';
import { env } from './env';
import { safeNext, saveOAuthIntent } from './redirect';

export { safeNext } from './redirect';

export function completeLogin(tokens: Pick<AuthTokens, 'accessToken' | 'user'>) {
  useAuthStore.getState().setSession(tokens);
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
