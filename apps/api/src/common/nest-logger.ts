import type { LoggerService } from '@nestjs/common';
import { logger } from './logger';

/** Nest 내부 로그를 pino 로 보낸다 */
export class PinoNestLogger implements LoggerService {
  log(message: unknown, context?: string) {
    logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    if (typeof message === 'object') logger.error({ context, ...(message as object) }, trace);
    else logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    logger.trace({ context }, String(message));
  }
}
