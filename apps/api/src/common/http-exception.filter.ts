import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_MESSAGES, type ErrorCode } from '@shop/shared';
import type { Request, Response } from 'express';
import { isProd } from '../config/env';
import { AppException } from './app-exception';

const STATUS_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'IMAGE_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/**
 * 모든 에러를 { error: { code, message, details } } 로 통일한다 (docs/API.md).
 * 5xx 는 고정 문구만 내보내고 상세는 서버 로그(requestId 포함)에만 남긴다.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const { status, code, message, details } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, requestId: req.id, path: req.path }, 'unhandled error');
    }

    const body: Record<string, unknown> = { code, message };
    if (details) body.details = details;
    if (!isProd() && status >= 500 && exception instanceof Error) body.debug = exception.stack;
    res.status(status).json({ error: body });
  }

  private normalize(e: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  } {
    if (e instanceof AppException) {
      return { status: e.getStatus(), code: e.code, message: e.message, details: e.details };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, code: 'CONFLICT', message: ERROR_MESSAGES.CONFLICT };
      if (e.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code = STATUS_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED');
      return { status, code, message: ERROR_MESSAGES[code] };
    }
    return { status: 500, code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL };
  }
}
