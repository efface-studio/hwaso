import type { AuthTokens, MeDto } from '@shop/shared';
import { create } from 'zustand';
import { secure } from '@/lib/secure';

export const REFRESH_KEY = 'hwaso.refresh';

interface AuthState {
  /** access 토큰은 메모리, refresh 토큰은 SecureStore (docs/AUTH.md) */
  accessToken: string | null;
  user: MeDto | null;
  /** 앱 시작 시 refresh 시도가 끝났는지 */
  ready: boolean;
  setSession: (t: AuthTokens) => Promise<void>;
  setUser: (user: MeDto) => void;
  clear: () => Promise<void>;
  markReady: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  ready: false,
  setSession: async (t) => {
    if (t.refreshToken) await secure.set(REFRESH_KEY, t.refreshToken);
    set({ accessToken: t.accessToken, user: t.user, ready: true });
  },
  setUser: (user) => set({ user }),
  clear: async () => {
    await secure.remove(REFRESH_KEY);
    set({ accessToken: null, user: null, ready: true });
  },
  markReady: () => set({ ready: true }),
}));
