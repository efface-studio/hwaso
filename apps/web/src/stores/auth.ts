import type { AuthTokens, MeDto } from '@shop/shared';
import { create } from 'zustand';

interface AuthState {
  /** 메모리에만 보관 (docs/AUTH.md). refresh 토큰은 httpOnly 쿠키 */
  accessToken: string | null;
  user: MeDto | null;
  /** 앱 부팅 시 refresh 시도가 끝났는지 */
  ready: boolean;
  setSession: (t: Pick<AuthTokens, 'accessToken' | 'user'>) => void;
  setUser: (user: MeDto) => void;
  clear: () => void;
  markReady: () => void;
}

/**
 * 이 브라우저에서 로그인한 적이 있는지 표시 (토큰 아님). 없으면 부팅 때 refresh 요청을 건너뛰어
 * 첫 방문자마다 401 이 나지 않게 한다. 저장소를 못 쓰는 환경은 항상 refresh 를 시도한다.
 */
const SESSION_HINT = 'hwaso.hasSession';
const hint = (on: boolean) => {
  try {
    if (on) localStorage.setItem(SESSION_HINT, '1');
    else localStorage.removeItem(SESSION_HINT);
  } catch {
    // 저장소 차단 — 표시 없이 동작
  }
};
export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === '1';
  } catch {
    return true;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  ready: false,
  setSession: ({ accessToken, user }) => {
    hint(true);
    set({ accessToken, user, ready: true });
  },
  setUser: (user) => set({ user }),
  clear: () => {
    hint(false);
    set({ accessToken: null, user: null, ready: true });
  },
  markReady: () => set({ ready: true }),
}));
