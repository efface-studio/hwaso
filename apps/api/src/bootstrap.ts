import './common/serialize';
import 'reflect-metadata';
import zlib from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { httpLogger } from './common/logger';
import { PinoNestLogger } from './common/nest-logger';
import { RedisIoAdapter } from './realtime/realtime';
import { clientIp, RateLimitService } from './common/rate-limit';
import { S3Service } from './storage/s3.service';

export const API_PREFIX = 'api/v1';

/** main.ts 와 통합 테스트가 같은 설정으로 앱을 만든다 */
export async function createApp(testing?: TestingModule): Promise<INestApplication> {
  const e = env();
  const app = testing
    ? testing.createNestApplication<NestExpressApplication>({ logger: false })
    : await NestFactory.create<NestExpressApplication>(AppModule, { logger: new PinoNestLogger() });
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '1mb' });
  app.use(httpLogger);
  // JSON 응답 압축: 1KB 이상, br 우선·gzip. 이미지 등 압축 불가 타입은 건너뛴다 (docs/API.md)
  // br 품질 8: 홈 JSON 기준 gzip 보다 16% 작고 0.3ms 안팎. 창은 256KB 로 줄여 동시 응답 메모리를 아낀다
  app.use(
    compression({
      threshold: 1024,
      brotli: {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 8, [zlib.constants.BROTLI_PARAM_LGWIN]: 18 },
      },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: e.WEB_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  // 전역 IP rate limit (docs/API.md) — 헬스체크 제외
  const limiter = app.get(RateLimitService);
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.endsWith('/health') || e.NODE_ENV === 'test') return next();
    try {
      if (await limiter.exceeded(`global:ip:${clientIp(req)}`, 300, 60)) {
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        });
        return;
      }
    } catch {
      // Redis 장애 시 요청을 막지 않는다 (가용성 우선, 개별 규칙은 가드에서 다시 검사)
    }
    next();
  });

  app.setGlobalPrefix(API_PREFIX);
  // 테스트는 단일 인스턴스라 인메모리 어댑터로 충분하다 (Redis 어댑터의 백그라운드 구독이 종료 시점에 끊기는 것 방지)
  if (e.NODE_ENV !== 'test') app.useWebSocketAdapter(new RedisIoAdapter(app));
  app.enableShutdownHooks();

  if (e.NODE_ENV === 'development') await app.get(S3Service).ensureBucket();
  return app;
}
