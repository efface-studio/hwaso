/**
 * 앱 브리지: 앱이 인앱 브라우저로 여는 웹 페이지(토스 결제창·우편번호)가 결과를 앱으로 돌려보낼 때 쓴다.
 * 돌아갈 주소는 앱 스킴만 허용해 오픈 리다이렉트를 막는다 (개발 중에는 Expo Go·웹 미리보기도 허용).
 */
const APP_SCHEME = process.env.NEXT_PUBLIC_APP_SCHEME ?? 'hwaso';

export function appReturnUrl(raw: string | null, mode = process.env.NODE_ENV): string | null {
  if (!raw) return null;
  if (raw.startsWith(`${APP_SCHEME}://`)) return raw;
  if (mode !== 'production' && (raw.startsWith('exp://') || /^http:\/\/localhost(:\d+)?\//.test(raw)))
    return raw;
  return null;
}

export function withParams(url: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return q ? `${url}${url.includes('?') ? '&' : '?'}${q}` : url;
}
