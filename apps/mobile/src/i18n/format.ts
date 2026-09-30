import i18n, { currentLanguage, LOCALE } from './index';

// Intl 포맷터는 만드는 비용이 커서 (로캘·옵션)마다 한 번만 만들어 다시 쓴다 — 목록 행마다 새로 만들지 않게
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
// 언어를 바꾸면 이전 언어의 포맷터는 더 쓰지 않으므로 비운다
i18n.on('languageChanged', () => {
  numberFormats.clear();
  dateFormats.clear();
});

/** 지금 언어(또는 지정한 로캘)의 숫자 포맷터 (캐시) */
export function numberFormat(options?: Intl.NumberFormatOptions, locale = LOCALE[currentLanguage()]) {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, f);
  }
  return f;
}

/**
 * 지금 언어(또는 지정한 로캘)의 날짜·시각 포맷터 (캐시).
 * toLocaleDateString 등과 달리 기본 필드를 채워 주지 않으므로 보여줄 필드를 options 에 모두 적는다.
 */
export function dateTimeFormat(options: Intl.DateTimeFormatOptions, locale = LOCALE[currentLanguage()]) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, f);
  }
  return f;
}

/**
 * 언어에 맞춘 표기. 가격은 모든 언어에서 원화(KRW)로 — 한국어는 "12,000원", 그 밖에는 "₩12,000".
 * 컴포넌트는 useTranslation 으로 언어가 바뀔 때 다시 그려지므로, 그 안에서 이 함수들을 부르면 된다.
 */
export function formatPrice(won: number): string {
  const lang = currentLanguage();
  if (lang === 'ko') return `${numberFormat(undefined, 'ko-KR').format(won)}원`;
  return numberFormat({ style: 'currency', currency: 'KRW' }).format(won);
}

export const formatNumber = (n: number): string => numberFormat().format(n);

/** 날짜 (예: 2026. 9. 30. / Sep 30, 2026) */
export const formatDate = (iso: string | Date): string =>
  dateTimeFormat({ year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));

/** 날짜 + 시각 */
export const formatDateTime = (iso: string | Date): string =>
  dateTimeFormat({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );

/** 시각만 (예: 오후 3:05 / 3:05 PM) */
export const formatTime = (iso: string | Date): string =>
  dateTimeFormat({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/** 방금 전 · n분 전 · n시간 전 · 어제 · n일 전, 일주일이 넘으면 날짜 */
export function formatRelative(iso: string | Date, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return i18n.t('common:time.justNow');
  if (min < 60) return i18n.t('common:time.minutesAgo', { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return i18n.t('common:time.hoursAgo', { count: hours });
  if (hours < 48) return i18n.t('common:time.yesterday');
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t('common:time.daysAgo', { count: days });
  return formatDate(iso);
}
