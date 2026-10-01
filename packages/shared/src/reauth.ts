// 재인증 상수 — zod 를 쓰지 않는 파일에 둔다. api-client(모든 웹 화면의 공통 번들)가 이 값만 쓰는데,
// security.ts 에서 가져오면 그 파일의 zod 스키마 때문에 zod 전체(약 100KB gzip)가 공통 번들에 들어간다

/** 민감 작업 요청에 재인증 토큰을 싣는 헤더 */
export const REAUTH_HEADER = 'x-reauth-token';
/** 재인증 토큰 수명 (초) */
export const REAUTH_TTL_SEC = 5 * 60;
