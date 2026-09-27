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

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  ready: false,
  setSession: ({ accessToken, user }) => set({ accessToken, user, ready: true }),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null, ready: true }),
  markReady: () => set({ ready: true }),
}));
