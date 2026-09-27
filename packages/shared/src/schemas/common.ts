import { z } from 'zod';

/** 원 단위 정수 금액. 문자열/소수 거부 */
export const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const positiveMoney = money.positive();

export const id = z.string().min(1).max(40);

export const cursorQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

/** 콤마 구분 쿼리 파라미터 → 배열 ("A,B" → ["A","B"]) */
export const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item));

export const queryBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
