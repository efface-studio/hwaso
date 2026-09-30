import i18n, { currentLanguage, LOCALE } from './index';

/**
 * 언어에 맞춘 표기. 가격은 모든 언어에서 원화(KRW)로 — 한국어는 "12,000원", 그 밖에는 "₩12,000".
 * 컴포넌트는 useTranslation 으로 언어가 바뀔 때 다시 그려지므로, 그 안에서 이 함수들을 부르면 된다.
 */
export function formatPrice(won: number): string {
  const lang = currentLanguage();
  if (lang === 'ko') return `${won.toLocaleString('ko-KR')}원`;
  return new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: 'KRW' }).format(won);
}

export const formatNumber = (n: number): string => n.toLocaleString(LOCALE[currentLanguage()]);

/** 날짜 (예: 2026. 9. 30. / Sep 30, 2026) */
export const formatDate = (iso: string | Date): string =>
  new Date(iso).toLocaleDateString(LOCALE[currentLanguage()], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

/** 날짜 + 시각 */
export const formatDateTime = (iso: string | Date): string =>
  new Date(iso).toLocaleString(LOCALE[currentLanguage()], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

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
