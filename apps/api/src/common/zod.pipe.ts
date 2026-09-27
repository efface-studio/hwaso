import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppException } from './app-exception';

/** 요청 본문/쿼리를 packages/shared 의 zod 스키마로 검증한다. strictObject 라 허용 외 필드는 거부된다. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    const first = Object.values(fields)[0];
    throw new AppException('VALIDATION_FAILED', first ?? undefined, { fields });
  }
}
