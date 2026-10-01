import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { AppException } from '../common/app-exception';
import { sha256 } from '../common/crypto';
import { RedisService } from '../redis/redis.service';
import {
  appleClientSecret,
  appleSigningKey,
  type OAuthProfile,
  verifyAppleIdTokenClaims,
} from './oauth.providers';

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
  /** Apple 공개키 (테스트에서 로컬 키로 교체) */
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

  constructor(private readonly redis: RedisService) {}

  /**
   * 앱이 보낸 identityToken 을 Apple 공개키로 검증하고 1회용으로 표시한다.
   * 로그인·연결·탈퇴 확인마다 앱이 새로 Sign in with Apple 을 하므로, 같은 토큰이 다시 오면 탈취·재전송으로 보고 거부한다.
   */
  async verifyIdToken(identityToken: string, audience: string[]): Promise<OAuthProfile> {
    const { profile, exp } = await verifyAppleIdTokenClaims(identityToken, audience, this.keys);
    const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 1) + 60;
    const first = await this.redis.set(`apple:idtoken:${sha256(identityToken)}`, '1', 'EX', ttl, 'NX');
    if (!first) throw new AppException('INVALID_TOKEN', 'Apple 로그인을 다시 시도해주세요.');
    return profile;
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
