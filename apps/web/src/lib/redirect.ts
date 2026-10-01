const BASE = 'https://same-origin.invalid';

/**
 * 오픈 리다이렉트 방지: 같은 사이트의 상대 경로만 허용 (docs/SECURITY.md).
 * 브라우저는 탭·줄바꿈을 지우고 `\` 를 `/` 로 읽으므로(`/\t/evil.com` → `//evil.com`) 제어 문자·역슬래시는 거부하고,
 * 실제로 해석한 주소가 같은 출처인지 한 번 더 확인한다.
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, BASE);
    if (u.origin !== BASE) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}

/** 소셜 로그인을 시작한 탭의 기록 — 콜백에서 같은 state 인지 확인한다 (로그인 CSRF 방지) */
export interface OAuthIntent {
  mode: 'login' | 'link';
  next: string;
  state: string | null;
}

export const OAUTH_MODE_KEY = 'shop-oauth-mode';

export function saveOAuthIntent(intent: OAuthIntent) {
  try {
    sessionStorage.setItem(OAUTH_MODE_KEY, JSON.stringify(intent));
  } catch {
    // 저장소를 못 쓰면 콜백이 state 를 확인할 수 없어 거부된다
  }
}

/** 한 번 읽고 지운다 */
export function takeOAuthIntent(): OAuthIntent | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_MODE_KEY);
    sessionStorage.removeItem(OAUTH_MODE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { mode?: string; next?: string; state?: unknown };
    return {
      mode: v.mode === 'link' ? 'link' : 'login',
      next: safeNext(v.next),
      state: typeof v.state === 'string' ? v.state : null,
    };
  } catch {
    return null;
  }
}

/** 이 탭에서 시작한 로그인의 state 와 provider 가 돌려준 state 가 같아야 한다 */
export const oauthStateMatches = (intent: OAuthIntent | null, state: string | null) =>
  !!intent?.state && !!state && intent.state === state;
