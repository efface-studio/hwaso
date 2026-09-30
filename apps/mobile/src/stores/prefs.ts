import { create } from 'zustand';
import { secure } from '@/lib/secure';

export type ThemePreference = 'system' | 'light' | 'dark';
/** 앱 언어 — system 이면 기기 언어를 따른다 (지원 언어는 src/i18n) */
export type LanguagePreference = 'system' | 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant';
const LANGUAGES: LanguagePreference[] = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant'];
const THEME_KEY = 'hwaso.theme';
const LANGUAGE_KEY = 'hwaso.language';
const SENIOR_KEY = 'hwaso.senior';
const APP_LOCK_KEY = 'hwaso.appLock';

interface PrefsState {
  theme: ThemePreference;
  language: LanguagePreference;
  /** 시니어 모드: 큰 글씨·큰 버튼·진한 글자·움직임 줄임 (웹과 같은 토큰) */
  senior: boolean;
  /** 앱 잠금: 백그라운드에서 돌아오면 생체 인증(Face ID·지문)으로 잠금 해제 */
  appLock: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTheme: (t: ThemePreference) => void;
  setLanguage: (l: LanguagePreference) => void;
  setSenior: (v: boolean) => void;
  setAppLock: (v: boolean) => void;
}

export const usePrefs = create<PrefsState>((set) => ({
  theme: 'system',
  language: 'system',
  senior: false,
  appLock: false,
  hydrated: false,
  hydrate: async () => {
    const [theme, language, senior, appLock] = await Promise.all([
      secure.get(THEME_KEY),
      secure.get(LANGUAGE_KEY),
      secure.get(SENIOR_KEY),
      secure.get(APP_LOCK_KEY),
    ]);
    set({
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
      language: LANGUAGES.find((l) => l === language) ?? 'system',
      senior: senior === '1',
      appLock: appLock === '1',
      hydrated: true,
    });
  },
  setTheme: (theme) => {
    set({ theme });
    void (theme === 'system' ? secure.remove(THEME_KEY) : secure.set(THEME_KEY, theme));
  },
  setLanguage: (language) => {
    set({ language });
    void (language === 'system' ? secure.remove(LANGUAGE_KEY) : secure.set(LANGUAGE_KEY, language));
  },
  setSenior: (senior) => {
    set({ senior });
    void (senior ? secure.set(SENIOR_KEY, '1') : secure.remove(SENIOR_KEY));
  },
  setAppLock: (appLock) => {
    set({ appLock });
    void (appLock ? secure.set(APP_LOCK_KEY, '1') : secure.remove(APP_LOCK_KEY));
  },
}));
