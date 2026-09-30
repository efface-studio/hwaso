import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { usePrefs, type LanguagePreference } from '@/stores/prefs';
import { NAMESPACES, resources } from './resources';

/** 지원 언어 (표시 순서) */
export const LANGUAGES = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant'] as const;
export type Language = (typeof LANGUAGES)[number];

/** 언어 이름은 그 언어로 적는다 (어느 언어로 보고 있어도 자기 언어를 찾을 수 있게) */
export const LANGUAGE_NAME: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
};

/** 날짜·숫자 표기에 쓰는 로캘 */
export const LOCALE: Record<Language, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
  'zh-Hans': 'zh-Hans-CN',
  'zh-Hant': 'zh-Hant-TW',
};

/**
 * 기기 언어 → 지원 언어. 중국어는 문자(Hant) 또는 지역(대만·홍콩·마카오)으로 번체를 고르고,
 * 지원하지 않는 언어는 영어로 보여준다.
 */
export function deviceLanguage(): Language {
  for (const l of getLocales()) {
    const code = l.languageCode;
    if (code === 'ko' || code === 'en' || code === 'ja') return code;
    if (code === 'zh') {
      const traditional = l.languageScriptCode === 'Hant' || ['TW', 'HK', 'MO'].includes(l.regionCode ?? '');
      return traditional ? 'zh-Hant' : 'zh-Hans';
    }
  }
  return 'en';
}

export const resolveLanguage = (pref: LanguagePreference): Language =>
  pref === 'system' ? deviceLanguage() : pref;

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(usePrefs.getState().language),
  fallbackLng: 'ko',
  ns: NAMESPACES,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

// 설정을 불러오거나 바꾸면 곧바로 반영한다
usePrefs.subscribe((state, prev) => {
  if (state.language !== prev.language) void i18n.changeLanguage(resolveLanguage(state.language));
});

/** 지금 화면에 쓰는 언어 */
export const currentLanguage = (): Language => LANGUAGES.find((l) => l === i18n.language) ?? 'ko';

export default i18n;
