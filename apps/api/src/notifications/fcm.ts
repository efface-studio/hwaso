import { importPKCS8, SignJWT } from 'jose';

/** Firebase 서비스 계정 JSON 중 발송에 쓰는 값 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface FcmResult {
  ok: boolean;
  status: number;
  /** FCM 오류 코드 (UNREGISTERED, INVALID_ARGUMENT …) */
  code?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 10_000;

/**
 * FCM HTTP v1 클라이언트. 서비스 계정으로 OAuth 액세스 토큰을 받아(1시간, 만료 5분 전 갱신) 기기별로 보낸다.
 * 별도 SDK(firebase-admin) 없이 JWT 서명은 jose 로 한다.
 */
export class FcmClient {
  private readonly account: ServiceAccount;
  private access: { token: string; expiresAt: number } | null = null;

  constructor(serviceAccountJson: string) {
    this.account = JSON.parse(serviceAccountJson) as ServiceAccount;
  }

  async send(deviceToken: string, data: Record<string, string>): Promise<FcmResult> {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        // 알림 모양은 앱(expo-notifications)이 data 로 그린다 — Expo 푸시와 같은 형식
        body: JSON.stringify({ message: { token: deviceToken, data, android: { priority: 'HIGH' } } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.ok) return { ok: true, status: res.status };
    const json = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; details?: { errorCode?: string }[] };
    };
    const code = json.error?.details?.find((d) => d.errorCode)?.errorCode ?? json.error?.status;
    return { ok: false, status: res.status, code };
  }

  private async accessToken() {
    if (this.access && Date.now() < this.access.expiresAt - 5 * 60_000) return this.access.token;
    const tokenUri = this.account.token_uri ?? DEFAULT_TOKEN_URI;
    const key = await importPKCS8(this.account.private_key, 'RS256');
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`FCM 인증 실패 (${res.status})`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.access = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }
}

/** 토큰을 지워야 하는 응답 */
export const fcmTokenIsDead = (r: FcmResult) => r.code === 'UNREGISTERED' || r.status === 404;
