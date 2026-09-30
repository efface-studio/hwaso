import type { AuthProvider } from '@shop/shared';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { AppException } from '../common/app-exception';
import { env } from '../config/env';

/** provider 가 돌려준 사용자 정보 (정규화) */
export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  /** provider 가 이메일 소유를 확인했는지 — 확인된 경우에만 기존 계정과 이메일 충돌을 판단한다 */
  emailVerified: boolean;
  name: string | null;
  /** Apple: 탈퇴·연결 해제 때 폐기할 refresh 토큰과 발급 client_id (로그에 남기지 않는다) */
  revokeToken?: { token: string; clientId: string } | null;
}

export interface ProviderSpec {
  configured: () => boolean;
  authorizeUrl: (p: { redirectUri: string; state: string; codeChallenge: string }) => string;
  exchange: (p: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    state: string;
  }) => Promise<OAuthProfile>;
}

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.error)
    throw new AppException('INVALID_TOKEN', '소셜 로그인 인증에 실패했습니다. 다시 시도해주세요.');
  return json;
}

async function getJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new AppException('INVALID_TOKEN', '소셜 계정 정보를 가져오지 못했습니다.');
  return (await res.json()) as Record<string, unknown>;
}

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

interface AppleKey {
  teamId: string;
  keyId: string;
  privateKey: string;
}

/**
 * Apple 서명 키. 웹 서비스 ID 는 기존 APPLE_* 를 먼저, 앱 번들 ID 는 APPLE_SIGNIN_* → APNS_* → APPLE_* 순으로 찾는다
 * (같은 팀의 Sign in with Apple 사용 키면 어느 것이든 된다)
 */
export function appleSigningKey(clientId: string): AppleKey | null {
  const e = env();
  const web: Partial<AppleKey> = {
    teamId: e.APPLE_TEAM_ID,
    keyId: e.APPLE_KEY_ID,
    privateKey: e.APPLE_PRIVATE_KEY,
  };
  const signin: Partial<AppleKey> = {
    teamId: e.APPLE_SIGNIN_TEAM_ID,
    keyId: e.APPLE_SIGNIN_KEY_ID,
    privateKey: e.APPLE_SIGNIN_PRIVATE_KEY,
  };
  const apns: Partial<AppleKey> = {
    teamId: e.APNS_TEAM_ID,
    keyId: e.APNS_KEY_ID,
    privateKey: e.APNS_PRIVATE_KEY,
  };
  const order = clientId === e.APPLE_CLIENT_ID ? [web, signin, apns] : [signin, apns, web];
  const found = order.find((k) => k.teamId && k.keyId && k.privateKey);
  return found ? (found as AppleKey) : null;
}

/** Apple client_secret: 팀 키로 서명한 ES256 JWT (최대 6개월, 여기선 5분). sub 는 토큰을 발급받은 client_id */
export async function appleClientSecret(clientId: string): Promise<string> {
  const k = appleSigningKey(clientId);
  if (!k) throw new AppException('PROVIDER_NOT_CONFIGURED', undefined, undefined, 400);
  const key = await importPKCS8(k.privateKey.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: k.keyId })
    .setIssuer(k.teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

/** Apple id_token 검증 (웹: 서비스 ID, iOS 네이티브: 번들 ID) */
export async function verifyAppleIdToken(idToken: string, audience: string[]): Promise<OAuthProfile> {
  try {
    const { payload } = await jwtVerify(idToken, appleJwks, {
      issuer: 'https://appleid.apple.com',
      audience,
    });
    return {
      providerUserId: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: null,
    };
  } catch {
    throw new AppException('INVALID_TOKEN', 'Apple 로그인 인증에 실패했습니다.');
  }
}

export const PROVIDERS: Record<AuthProvider, ProviderSpec> = {
  GOOGLE: {
    configured: () => !!(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET),
    authorizeUrl: ({ redirectUri, state, codeChallenge }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${qs({
        client_id: env().GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      })}`,
    exchange: async ({ code, redirectUri, codeVerifier }) => {
      const token = await postForm('https://oauth2.googleapis.com/token', {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: env().GOOGLE_CLIENT_ID!,
        client_secret: env().GOOGLE_CLIENT_SECRET!,
        code_verifier: codeVerifier,
      });
      try {
        const { payload } = await jwtVerify(String(token.id_token), googleJwks, {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: env().GOOGLE_CLIENT_ID!,
        });
        return {
          providerUserId: String(payload.sub),
          email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
          emailVerified: payload.email_verified === true,
          name: typeof payload.name === 'string' ? payload.name : null,
        };
      } catch {
        throw new AppException('INVALID_TOKEN', 'Google 로그인 인증에 실패했습니다.');
      }
    },
  },

  APPLE: {
    configured: () =>
      !!(env().APPLE_CLIENT_ID && env().APPLE_TEAM_ID && env().APPLE_KEY_ID && env().APPLE_PRIVATE_KEY),
    authorizeUrl: ({ redirectUri, state }) =>
      `https://appleid.apple.com/auth/authorize?${qs({
        client_id: env().APPLE_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        // 이름·이메일을 요청하면 Apple 은 form_post 로만 응답한다 (웹 /auth/callback/apple 라우트가 받는다)
        response_mode: 'form_post',
        scope: 'name email',
        state,
      })}`,
    exchange: async ({ code, redirectUri }) => {
      const clientId = env().APPLE_CLIENT_ID!;
      const token = await postForm('https://appleid.apple.com/auth/token', {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: await appleClientSecret(clientId),
      });
      const profile = await verifyAppleIdToken(String(token.id_token), [clientId]);
      const refresh = typeof token.refresh_token === 'string' ? token.refresh_token : null;
      return { ...profile, revokeToken: refresh ? { token: refresh, clientId } : null };
    },
  },

  KAKAO: {
    configured: () => !!env().KAKAO_CLIENT_ID,
    authorizeUrl: ({ redirectUri, state }) =>
      `https://kauth.kakao.com/oauth/authorize?${qs({
        client_id: env().KAKAO_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
      })}`,
    exchange: async ({ code, redirectUri }) => {
      const token = await postForm('https://kauth.kakao.com/oauth/token', {
        grant_type: 'authorization_code',
        client_id: env().KAKAO_CLIENT_ID!,
        ...(env().KAKAO_CLIENT_SECRET ? { client_secret: env().KAKAO_CLIENT_SECRET! } : {}),
        redirect_uri: redirectUri,
        code,
      });
      const me = await getJson('https://kapi.kakao.com/v2/user/me', String(token.access_token));
      const account = (me.kakao_account ?? {}) as Record<string, unknown>;
      const profile = (account.profile ?? {}) as Record<string, unknown>;
      return {
        providerUserId: String(me.id),
        email: typeof account.email === 'string' ? account.email.toLowerCase() : null,
        emailVerified: account.is_email_valid === true && account.is_email_verified === true,
        name: typeof profile.nickname === 'string' ? profile.nickname : null,
      };
    },
  },

  NAVER: {
    configured: () => !!(env().NAVER_CLIENT_ID && env().NAVER_CLIENT_SECRET),
    authorizeUrl: ({ redirectUri, state }) =>
      `https://nid.naver.com/oauth2.0/authorize?${qs({
        client_id: env().NAVER_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
      })}`,
    exchange: async ({ code, state }) => {
      const token = await postForm('https://nid.naver.com/oauth2.0/token', {
        grant_type: 'authorization_code',
        client_id: env().NAVER_CLIENT_ID!,
        client_secret: env().NAVER_CLIENT_SECRET!,
        code,
        state,
      });
      const me = await getJson('https://openapi.naver.com/v1/nid/me', String(token.access_token));
      const r = (me.response ?? {}) as Record<string, unknown>;
      return {
        providerUserId: String(r.id),
        email: typeof r.email === 'string' ? r.email.toLowerCase() : null,
        // 네이버는 로그인 계정 이메일(인증된 연락처 이메일)을 준다
        emailVerified: typeof r.email === 'string',
        name: typeof r.nickname === 'string' ? r.nickname : typeof r.name === 'string' ? r.name : null,
      };
    },
  },
};
