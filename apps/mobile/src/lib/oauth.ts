import type { AuthProvider, AuthTokens, DeleteAccountInput } from '@shop/shared';
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
 * PKCE·state 는 서버가 보관·검증하고, 앱도 돌아온 state 가 이 요청의 것인지 확인한다.
 */
async function authorizeInBrowser(provider: AuthProvider) {
  const appRedirect = Linking.createURL('auth/callback');
  const { url, state: expected } = await api.auth.oauthUrl(provider, { appRedirect });
  const result = await WebBrowser.openAuthSessionAsync(url, appRedirect);
  if (result.type !== 'success') throw new OAuthCancelled();
  const params = new URL(result.url).searchParams;
  const error = params.get('error');
  const code = params.get('code');
  const state = params.get('state');
  if (error || !code || !state) throw new Error(error || i18n.t('common:oauth.cancelled'));
  // 이 요청이 받은 state 로 돌아온 딥링크만 받는다 (다른 앱·페이지가 보낸 code 로 로그인·연결되지 않게)
  if (state !== expected) throw new Error(i18n.t('common:oauth.cancelled'));
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

/** 시스템 Sign in with Apple 창 — 취소하면 OAuthCancelled */
async function appleCredential(scopes: AppleAuthentication.AppleAuthenticationScope[]) {
  try {
    const cred = await AppleAuthentication.signInAsync({ requestedScopes: scopes });
    if (!cred.identityToken) throw new Error(i18n.t('common:oauth.appleNoToken'));
    return { ...cred, identityToken: cred.identityToken };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new OAuthCancelled();
    throw e;
  }
}

/**
 * iOS: 시스템 Sign in with Apple — identityToken 을 서버가 Apple 공개키로 검증한다.
 * authorizationCode 도 함께 보내 서버가 refresh 토큰으로 바꿔 두고, 탈퇴·연결 해제 때 Apple 에 폐기(revoke)한다.
 */
export async function appleNativeLogin(): Promise<AuthTokens & { isNewUser: boolean }> {
  const cred = await appleCredential([
    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    AppleAuthentication.AppleAuthenticationScope.EMAIL,
  ]);
  const name = [cred.fullName?.familyName, cred.fullName?.givenName].filter(Boolean).join('') || undefined;
  const tokens = await api.auth.appleNative({
    identityToken: cred.identityToken,
    authorizationCode: cred.authorizationCode ?? undefined,
    name,
    device: appDevice(),
  });
  await useAuthStore.getState().setSession(tokens);
  return tokens;
}

/** iOS: 로그인한 계정에 시스템 Sign in with Apple 계정 연결 (authorizationCode 는 해제·탈퇴 때 폐기용) */
export async function linkAppleNative(): Promise<void> {
  const cred = await appleCredential([]);
  await api.auth.linkAppleNative({
    identityToken: cred.identityToken,
    authorizationCode: cred.authorizationCode ?? undefined,
  });
}

/**
 * 탈퇴 전 본인 확인: 연결된 소셜 계정으로 한 번 더 인증한다 (비밀번호·실제 이메일이 없는 소셜 가입자용).
 * 서버가 인증 결과 계정이 이 회원에게 연결돼 있는지 대조한다. iOS 의 Apple 은 시스템 창(nativeApple).
 */
export async function socialDeleteProof(
  provider: AuthProvider,
  nativeApple: boolean,
): Promise<DeleteAccountInput> {
  if (provider === 'APPLE' && nativeApple) {
    const cred = await appleCredential([]);
    return {
      provider,
      identityToken: cred.identityToken,
      authorizationCode: cred.authorizationCode ?? undefined,
    };
  }
  return { provider, ...(await authorizeInBrowser(provider)) };
}
