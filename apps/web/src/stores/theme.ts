import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'shop-theme';

/** 첫 페인트 전에 실행 — 저장된 테마를 적용해 깜빡임을 막는다 */
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  preference: ThemePreference;
  hydrate: () => void;
  setPreference: (p: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  hydrate: () => set({ preference: readPreference() }),
  setPreference: (preference) => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
    try {
      if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // 저장소를 쓸 수 없는 환경(사파리 비공개 모드 등)에서는 이번 세션에만 적용된다
    }
    set({ preference });
  },
}));
