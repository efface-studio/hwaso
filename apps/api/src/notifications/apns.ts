import http2 from 'node:http2';
import { importPKCS8, SignJWT } from 'jose';

/** APNs 토큰 인증 설정 (.p8 키) */
export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  topic: string;
}

export interface ApnsResult {
  status: number;
  /** 실패 사유 (BadDeviceToken, Unregistered, InvalidProviderToken …) */
  reason?: string;
}

const HOST = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;
export type ApnsEnvironment = keyof typeof HOST;

/** 공급자 토큰은 20~60분 사이에 갱신해야 한다 (너무 자주 만들면 TooManyProviderTokenUpdates) */
const TOKEN_TTL_MS = 50 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * APNs HTTP/2 클라이언트. 연결은 환경(운영·샌드박스)별로 하나를 재사용하고, 끊기면 다음 요청에서 다시 연다.
 * 알림 1건 = 요청 1건 (APNs 는 일괄 발송 API 가 없다).
 */
export class ApnsClient {
  private readonly sessions = new Map<ApnsEnvironment, http2.ClientHttp2Session>();
  private jwt: { value: string; at: number } | null = null;

  constructor(private readonly config: ApnsConfig) {}

  async send(
    deviceToken: string,
    payload: object,
    env: ApnsEnvironment,
    headers: { collapseId?: string } = {},
  ): Promise<ApnsResult> {
    const authorization = `bearer ${await this.providerToken()}`;
    const body = JSON.stringify(payload);
    const session = this.session(env);
    return new Promise<ApnsResult>((resolve, reject) => {
      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization,
        'apns-topic': this.config.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        ...(headers.collapseId ? { 'apns-collapse-id': headers.collapseId } : {}),
        'content-type': 'application/json',
      });
      let status = 0;
      let data = '';
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on('response', (h) => (status = Number(h[':status'])));
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => (data += chunk));
      req.on('end', () => {
        let reason: string | undefined;
        if (data) {
          try {
            reason = (JSON.parse(data) as { reason?: string }).reason;
          } catch {
            reason = data;
          }
        }
        if (status === 403 && reason === 'ExpiredProviderToken') this.jwt = null;
        resolve({ status, reason });
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  close() {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }

  private session(env: ApnsEnvironment) {
    const current = this.sessions.get(env);
    if (current && !current.closed && !current.destroyed) return current;
    const next = http2.connect(HOST[env]);
    next.on('error', () => this.sessions.delete(env));
    next.on('close', () => this.sessions.delete(env));
    // 열린 연결이 프로세스 종료를 막지 않게
    next.unref();
    this.sessions.set(env, next);
    return next;
  }

  private async providerToken() {
    if (this.jwt && Date.now() - this.jwt.at < TOKEN_TTL_MS) return this.jwt.value;
    const key = await importPKCS8(this.config.privateKey, 'ES256');
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setIssuedAt()
      .sign(key);
    this.jwt = { value, at: Date.now() };
    return value;
  }
}

/** 토큰을 지워야 하는 응답 (기기에서 앱이 지워졌거나 토큰이 바뀜) */
export const apnsTokenIsDead = (r: ApnsResult) =>
  r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken';
