import 'server-only';
import { createApiClient } from '@shop/api-client';
import { env } from './env';

/**
 * 서버 컴포넌트용 API 클라이언트 (공개 데이터만). 60초 ISR 캐시.
 * 사용자별 데이터는 클라이언트에서 조회한다 (docs/WEB_ROUTES.md).
 */
export const serverApi = createApiClient({
  baseUrl: process.env.API_INTERNAL_URL ?? env.apiUrl,
  getAccessToken: () => null,
  fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, next: { revalidate: 60 } })) as typeof fetch,
});

/** 빌드 시점처럼 API 에 닿지 않을 때 페이지 전체가 실패하지 않도록 null 로 받는다 */
export async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
