import {
  ERROR_MESSAGES,
  REAUTH_HEADER,
  REAUTH_TTL_SEC,
  type ApiErrorBody,
  type ErrorCode,
} from '@shop/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** 401 시 토큰 갱신 후 재시도 (기본 true) */
  retryOnUnauthorized?: boolean;
  /**
   * 민감 작업 재인증 토큰을 직접 지정한다 (`x-reauth-token`). 지정하면 저장된 토큰 대신 이 값을 보내고,
   * 서버가 거부해도 `reauth` 훅을 부르지 않는다.
   */
  reauthToken?: string;
}

export interface HttpConfig {
  /** 예: https://api.shop.efface.dev/api/v1 */
  baseUrl: string;
  getAccessToken: () => string | null;
  /** 새 access 토큰을 돌려준다. 실패 시 null (로그아웃 처리). */
  refresh?: () => Promise<string | null>;
  /** Web: 'include' (refresh 쿠키), Mobile: 'omit' */
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
  /**
   * 서버가 403 REAUTH_REQUIRED 를 주면 호출된다. 사용자에게 본인 확인(생체·비밀번호·OTP)을 받아
   * `POST /auth/reauth` 로 얻은 재인증 토큰을 돌려준다. 사용자가 취소하면 null.
   * 동시에 여러 요청이 막혀도 한 번만 호출된다. 받은 토큰은 만료 전까지 저장되어 다음 요청에도 붙는다.
   */
  reauth?: () => Promise<string | null>;
}

/** 저장된 재인증 토큰을 만료 이 시간 전부터는 쓰지 않는다 (시계 오차·전송 시간) */
const REAUTH_SKEW_MS = 10_000;

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  if (body?.error?.code)
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  const code: ErrorCode =
    res.status === 429 ? 'RATE_LIMITED' : res.status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED';
  return new ApiError(res.status, code, ERROR_MESSAGES[code]);
}

export function createHttp(config: HttpConfig) {
  const doFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  let refreshing: Promise<string | null> | null = null;
  let reauthing: Promise<string | null> | null = null;
  let reauthCache: { token: string; expiresAt: number } | null = null;

  /** 재인증 토큰 저장 (만료 전까지 모든 요청에 x-reauth-token 으로 붙인다). null 이면 지운다 */
  const setReauthToken = (token: string | null, expiresAt?: string) => {
    const exp = expiresAt ? Date.parse(expiresAt) : Date.now() + REAUTH_TTL_SEC * 1000;
    reauthCache = token && Number.isFinite(exp) ? { token, expiresAt: exp } : null;
  };

  const cachedReauth = () => {
    if (reauthCache && reauthCache.expiresAt - REAUTH_SKEW_MS > Date.now()) return reauthCache.token;
    reauthCache = null;
    return null;
  };

  const reauthOnce = () => {
    // 동시에 막힌 요청들은 본인 확인 한 번을 함께 기다린다
    reauthing ??= (config.reauth?.() ?? Promise.resolve(null))
      .then((token) => {
        if (token && reauthCache?.token !== token) setReauthToken(token);
        return token;
      })
      .finally(() => {
        reauthing = null;
      });
    return reauthing;
  };

  /** 403 이 재인증 요구인지 (본문은 복제본에서 읽어 원래 응답은 에러 변환에 그대로 쓴다) */
  const isReauthRequired = async (res: Response) => {
    if (res.status !== 403) return false;
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    return body?.error?.code === 'REAUTH_REQUIRED';
  };

  const refreshOnce = () => {
    // 동시에 여러 요청이 401 을 받아도 refresh 는 한 번만 (rotation 재사용 탐지 오작동 방지)
    refreshing ??= (config.refresh?.() ?? Promise.resolve(null)).finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  async function send(
    method: string,
    path: string,
    opts: RequestOptions,
    token: string | null,
    reauthToken: string | null,
  ): Promise<Response> {
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'shop' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (reauthToken) headers[REAUTH_HEADER] = reauthToken;
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    try {
      return await doFetch(`${config.baseUrl}${path}${buildQuery(opts.query)}`, {
        method,
        headers,
        body:
          opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
        credentials: config.credentials ?? 'omit',
        signal: opts.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ApiError(0, 'INTERNAL', '네트워크 연결을 확인해주세요.');
    }
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    let reauthToken = opts.reauthToken ?? cachedReauth();
    let res = await send(method, path, opts, config.getAccessToken(), reauthToken);
    if (res.status === 401 && opts.retryOnUnauthorized !== false && config.refresh) {
      const token = await refreshOnce();
      if (token) res = await send(method, path, opts, token, reauthToken);
    }
    // 403 REAUTH_REQUIRED: 호출자가 토큰을 직접 주지 않았다면 본인 확인 후 한 번만 다시 보낸다.
    // 저장된 토큰이 거부됐다면(다른 기기·만료) 지우고 새로 받는다.
    if (!opts.reauthToken && config.reauth && (await isReauthRequired(res))) {
      if (reauthToken && reauthCache?.token === reauthToken) reauthCache = null;
      reauthToken = await reauthOnce();
      if (!reauthToken) throw new ApiError(403, 'REAUTH_REQUIRED', ERROR_MESSAGES.REAUTH_REQUIRED);
      res = await send(method, path, opts, config.getAccessToken(), reauthToken);
      // 본인 확인을 기다리는 사이 access 토큰이 만료됐을 수 있다
      if (res.status === 401 && opts.retryOnUnauthorized !== false && config.refresh) {
        const token = await refreshOnce();
        if (token) res = await send(method, path, opts, token, reauthToken);
      }
    }
    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  type Opts = Omit<RequestOptions, 'body'>;
  return {
    request,
    setReauthToken,
    get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
    post: <T>(path: string, body?: unknown, opts?: Opts) => request<T>('POST', path, { ...opts, body }),
    put: <T>(path: string, body?: unknown, opts?: Opts) => request<T>('PUT', path, { ...opts, body }),
    patch: <T>(path: string, body?: unknown, opts?: Opts) => request<T>('PATCH', path, { ...opts, body }),
    delete: <T>(path: string, body?: unknown, opts?: Opts) => request<T>('DELETE', path, { ...opts, body }),
  };
}

export type Http = ReturnType<typeof createHttp>;
