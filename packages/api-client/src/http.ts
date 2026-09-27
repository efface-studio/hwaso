import { ERROR_MESSAGES, type ApiErrorBody, type ErrorCode } from '@shop/shared';

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
}

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
  ): Promise<Response> {
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'shop' };
    if (token) headers.Authorization = `Bearer ${token}`;
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
    let res = await send(method, path, opts, config.getAccessToken());
    if (res.status === 401 && opts.retryOnUnauthorized !== false && config.refresh) {
      const token = await refreshOnce();
      if (token) res = await send(method, path, opts, token);
    }
    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    request,
    get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
    post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
      request<T>('POST', path, { ...opts, body }),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
    delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
  };
}

export type Http = ReturnType<typeof createHttp>;
