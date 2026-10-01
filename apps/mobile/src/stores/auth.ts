import type { AuthTokens, MeDto } from '@shop/shared';
import { create } from 'zustand';
import { secure } from '@/lib/secure';

export const REFRESH_KEY = 'hwaso.refresh';
/**
 * 자동 로그인을 끈 세션 표시. 있으면 다음 실행 때 세션을 이어 쓰지 않고 서버 세션까지 끝낸다 (lib/api restoreSession).
 * refresh 토큰은 그대로 키체인에 둔다 — 같은 실행 안의 토큰 갱신과 다음 실행의 서버 로그아웃에 필요하다
 */
export const EPHEMERAL_KEY = 'hwaso.session.ephemeral';

interface AuthState {
  /** access 토큰은 메모리, refresh 토큰은 SecureStore (docs/AUTH.md) */
  accessToken: string | null;
  user: MeDto | null;
  /** 앱 시작 시 refresh 시도가 끝났는지 */
  ready: boolean;
  /** 자동 로그인: false 면 이번 실행 동안만 로그인 상태를 유지한다 (로그인 화면에서 고른다) */
  persistent: boolean;
  setSession: (t: AuthTokens) => Promise<void>;
  setUser: (user: MeDto) => void;
  setPersistent: (v: boolean) => void;
  clear: () => Promise<void>;
  markReady: () => void;
}

/** 표시를 이미 맞춰 둔 값 — 토큰을 갱신할 때마다 키체인을 다시 쓰지 않게 */
let ephemeralStored: boolean | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  ready: false,
  persistent: true,
  setSession: async (t) => {
    if (t.refreshToken) {
      await secure.set(REFRESH_KEY, t.refreshToken);
      const ephemeral = !get().persistent;
      if (ephemeralStored !== ephemeral) {
        await (ephemeral ? secure.set(EPHEMERAL_KEY, '1') : secure.remove(EPHEMERAL_KEY));
        ephemeralStored = ephemeral;
      }
    }
    set({ accessToken: t.accessToken, user: t.user, ready: true });
  },
  setUser: (user) => set({ user }),
  setPersistent: (persistent) => set({ persistent }),
  clear: async () => {
    await secure.remove(REFRESH_KEY);
    await secure.remove(EPHEMERAL_KEY);
    ephemeralStored = false;
    set({ accessToken: null, user: null, ready: true });
  },
  markReady: () => set({ ready: true }),
}));
