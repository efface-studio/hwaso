import { useAuthStore } from '@/stores/auth';
import { useEntry } from '@/stores/entry';

/** 로그인해야 열리는 화면 (app/_layout.tsx 의 signedIn 가드와 맞춘다). 채팅·판매 탭 자체는 둘러보기 화면이 있다 */
const PROTECTED = [
  /^\/chat\/[^/]+/,
  /^\/orders(\/|$)/,
  /^\/notifications$/,
  /^\/cart$/,
  /^\/checkout$/,
  /^\/addresses(\/|$)/,
  /^\/sell\/.+/,
  /^\/seller(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/report$/,
  /^\/admin(\/|$)/,
  /^\/feed$/,
];
/** 첫 화면 선택과 상관없는 경로 — 소셜 로그인·결제 복귀, 앱 홈, 로그인 화면들 */
const IGNORED = [/^\/$/, /^\/auth\//, /^\/bridge$/, /^\/(login|signup|forgot-password|consent)$/];

/** hwaso://products/1 · https://hwaso.kr/products/1 · /products/1 → /products/1 (쿼리 유지) */
export function toAppPath(url: string): string {
  let rest = url;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url);
  if (scheme) {
    rest = url.slice(scheme[0].length);
    // 웹 주소는 호스트를 뺀다. 앱 스킴은 호스트 자리가 경로의 첫 칸이다 (hwaso://products/1)
    if (/^https?$/i.test(scheme[1]!)) rest = rest.includes('/') ? rest.slice(rest.indexOf('/')) : '';
    // Expo Go·개발 빌드 주소 (exp://host/--/products/1)
    const dev = rest.indexOf('/--/');
    if (dev !== -1) rest = rest.slice(dev + 3);
  }
  return `/${rest.replace(/^\/+/, '')}`;
}

const pathnameOf = (path: string) => path.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';

export const isProtectedPath = (path: string) => PROTECTED.some((r) => r.test(pathnameOf(path)));

/**
 * 앱 바깥에서 들어온 링크(유니버설 링크·앱 스킴)를 첫 화면 선택에 반영한다 (app/+native-intent.tsx).
 * - 공유받은 작품·경매·프로필 같은 공개 화면: 로그인 화면 없이 바로 보여준다 (둘러보기로 들어온 것으로 본다)
 * - 로그인해야 하는 화면: 로그인(또는 앱 시작의 세션 복구)이 끝난 뒤 연다
 */
export function noteIncomingLink(url: string) {
  const path = toAppPath(url);
  if (IGNORED.some((r) => r.test(pathnameOf(path)))) return;
  const { user, ready } = useAuthStore.getState();
  if (isProtectedPath(path)) {
    if (!ready || !user) useEntry.setState({ pending: path });
  } else if (!user) {
    useEntry.setState({ guest: true });
  }
}
