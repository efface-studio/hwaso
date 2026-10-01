import { Injectable, Logger } from '@nestjs/common';
import { appleClientSecret, appleSigningKey, type OAuthProfile, verifyAppleIdToken } from './oauth.providers';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const TIMEOUT_MS = 10_000;

/**
 * Sign in with Apple 서버 연동 (App Store 심사 5.1.1(v): 탈퇴 시 Apple 토큰 폐기).
 * 외부 호출을 한곳에 모아 테스트에서 교체한다. 토큰·코드는 로그에 남기지 않는다.
 */
@Injectable()
export class AppleAuthClient {
  private readonly logger = new Logger(AppleAuthClient.name);

  /** identityToken 을 Apple 공개키로 검증 */
  verifyIdToken(identityToken: string, audience: string[]): Promise<OAuthProfile> {
    return verifyAppleIdToken(identityToken, audience);
  }

  /** 키가 설정돼 있어 교환·폐기를 할 수 있는지 */
  configured(clientId: string): boolean {
    return !!appleSigningKey(clientId);
  }

  /**
   * 앱이 받은 authorization code 를 refresh 토큰으로 교환한다. 실패해도 로그인을 막지 않도록 null 을 돌려준다.
   */
  async exchangeCode(code: string, clientId: string): Promise<string | null> {
    if (!this.configured(clientId)) return null;
    try {
      const res = await fetch(APPLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: await appleClientSecret(clientId),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as { refresh_token?: unknown; error?: unknown };
      if (!res.ok || typeof json.refresh_token !== 'string') {
        this.logger.warn({ status: res.status, error: json.error }, 'apple code exchange failed');
        return null;
      }
      return json.refresh_token;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'apple code exchange failed');
      return null;
    }
  }

  /** refresh 토큰 폐기. 실패는 기록만 하고 호출한 흐름(탈퇴·해제)을 막지 않는다 */
  async revoke(refreshToken: string, clientId: string): Promise<boolean> {
    if (!this.configured(clientId)) {
      this.logger.warn('apple revoke skipped: signing key not configured');
      return false;
    }
    try {
      const res = await fetch(APPLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: await appleClientSecret(clientId),
          token: refreshToken,
          token_type_hint: 'refresh_token',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.warn({ status: res.status }, 'apple revoke failed');
      return res.ok;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'apple revoke failed');
      return false;
    }
  }
}
