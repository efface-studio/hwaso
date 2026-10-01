import { containsProhibited } from '@shop/shared';
import { AppException } from './app-exception';

/**
 * 사용자 입력 금칙어 검사 (@shop/shared moderation — 클라이언트도 같은 함수로 미리 안내한다).
 * 걸리면 400 PROHIBITED_CONTENT, details.fields 에 해당 필드를 담는다.
 */
export function assertClean(fields: Record<string, string | null | undefined>) {
  const bad = Object.entries(fields).filter(([, v]) => containsProhibited(v));
  if (bad.length)
    throw new AppException('PROHIBITED_CONTENT', undefined, {
      fields: Object.fromEntries(bad.map(([k]) => [k, '부적절한 표현이 포함되어 있어요.'])),
    });
}
