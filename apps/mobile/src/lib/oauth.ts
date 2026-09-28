import type { AuthProvider, AuthTokens } from '@shop/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '@/stores/auth';
import { api } from './api';
import { appDevice } from './device';
import { env } from './env';

WebBrowser.maybeCompleteAuthSession();

/** provider 가 돌아오는 API 중계 주소 — 서버의 mobileRelayUri 와 같아야 한다 */
const relayUri = (provider: AuthProvider) => `${env.apiUrl}/auth/oauth/${provider.toLowerCase()}/redirect`;

export class OAuthCancelled extends Error {}

/**
 * 카카오·네이버·구글(·Android Apple): 인앱 브라우저로 로그인 → API 가 code 를 앱 딥링크로 중계 → 앱이 교환.
 * PKCE·state 는 서버가 보관·검증한다.
 */
export async function socialLogin(provider: AuthProvider): Promise<AuthTokens & { isNewUser: boolean }> {
  const appRedirect = Linking.createURL('auth/callback');
  const { url } = await api.auth.oauthUrl(provider, { appRedirect });
  const result = await WebBrowser.openAuthSessionAsync(url, appRedirect);
  if (result.type !== 'success') throw new OAuthCancelled();
  const params = new URL(result.url).searchParams;
  const error = params.get('error');
  const code = params.get('code');
  const state = params.get('state');
  if (error || !code || !state) throw new Error(error || '로그인이 취소되었어요.');
  const tokens = await api.auth.oauthCallback(provider, {
    code,
    state,
    redirectUri: relayUri(provider),
    device: appDevice(),
  });
  await useAuthStore.getState().setSession(tokens);
  return tokens;
}

/** iOS: 시스템 Sign in with Apple — identityToken 을 서버가 Apple 공개키로 검증 */
export async function appleNativeLogin(): Promise<AuthTokens & { isNewUser: boolean }> {
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!cred.identityToken) throw new Error('Apple 로그인 정보를 받지 못했어요.');
    const name = [cred.fullName?.familyName, cred.fullName?.givenName].filter(Boolean).join('') || undefined;
    const tokens = await api.auth.appleNative({
      identityToken: cred.identityToken,
      name,
      device: appDevice(),
    });
    await useAuthStore.getState().setSession(tokens);
    return tokens;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new OAuthCancelled();
    throw e;
  }
}
