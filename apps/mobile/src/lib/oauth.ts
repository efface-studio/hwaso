import type { AuthProvider, AuthTokens } from '@shop/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import i18n from '@/i18n';
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
async function authorizeInBrowser(provider: AuthProvider) {
  const appRedirect = Linking.createURL('auth/callback');
  const { url } = await api.auth.oauthUrl(provider, { appRedirect });
  const result = await WebBrowser.openAuthSessionAsync(url, appRedirect);
  if (result.type !== 'success') throw new OAuthCancelled();
  const params = new URL(result.url).searchParams;
  const error = params.get('error');
  const code = params.get('code');
  const state = params.get('state');
  if (error || !code || !state) throw new Error(error || i18n.t('common:oauth.cancelled'));
  return { code, state, redirectUri: relayUri(provider) };
}

export async function socialLogin(provider: AuthProvider): Promise<AuthTokens & { isNewUser: boolean }> {
  const grant = await authorizeInBrowser(provider);
  const tokens = await api.auth.oauthCallback(provider, { ...grant, device: appDevice() });
  await useAuthStore.getState().setSession(tokens);
  return tokens;
}

/** 로그인한 계정에 소셜 계정 연결 (설정 › 연결된 소셜 계정) */
export async function linkSocial(provider: AuthProvider): Promise<void> {
  await api.auth.linkSocial(provider, await authorizeInBrowser(provider));
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
    if (!cred.identityToken) throw new Error(i18n.t('common:oauth.appleNoToken'));
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
