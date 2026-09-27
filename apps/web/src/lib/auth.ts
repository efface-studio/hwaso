'use client';

import type { AuthProvider, AuthTokens } from '@shop/shared';
import { useAuthStore } from '@/stores/auth';
import { api } from './api';
import { env } from './env';

/** 오픈 리다이렉트 방지: 같은 사이트의 상대 경로만 허용 (docs/SECURITY.md) */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

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

export const OAUTH_MODE_KEY = 'shop-oauth-mode';

/** provider 가 돌아올 웹 주소. Apple 은 form_post 라 서버 라우트가 받는다 */
export function oauthRedirectUri(provider: AuthProvider): string {
  return provider === 'APPLE'
    ? `${env.siteUrl}/api/auth/apple`
    : `${env.siteUrl}/auth/callback/${provider.toLowerCase()}`;
}

/** 로그인(mode=login) 또는 설정에서 계정 연결(mode=link) 시작 */
export async function startOAuth(provider: AuthProvider, mode: 'login' | 'link', next?: string) {
  const { url } = await api.auth.oauthUrl(provider, { redirectUri: oauthRedirectUri(provider) });
  try {
    sessionStorage.setItem(OAUTH_MODE_KEY, JSON.stringify({ mode, next: safeNext(next) }));
  } catch {
    // 저장소를 못 쓰면 로그인 모드로 처리된다
  }
  window.location.assign(url);
}
