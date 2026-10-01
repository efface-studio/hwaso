import { Header } from '@nestjs/common';

/**
 * 사용자와 무관한 공개 GET 응답에 짧은 HTTP 캐시를 건다 (docs/API.md "캐시·압축").
 * 로그인 사용자별 값(isFavorite 등)·가격·입찰이 들어가는 응답에는 쓰지 않는다.
 * 에러 응답은 HttpExceptionFilter 가 no-store 로 덮어쓴다.
 */
export const PublicCache = (maxAge: number, staleWhileRevalidate = maxAge * 5) =>
  Header('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
