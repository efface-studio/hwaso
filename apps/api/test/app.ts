import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { S3Service } from '../src/storage/s3.service';

/** S3 는 외부 연동이라 메모리 더블로 교체한다 */
export class FakeS3 {
  objects = new Map<string, { contentType: string; size: number }>();
  put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { contentType, size: body.byteLength });
    return Promise.resolve();
  }
  ensureBucket() {
    return Promise.resolve();
  }
}

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof supertest>;
  prisma: PrismaService;
  redis: RedisService;
  s3: FakeS3;
}

export async function createTestApp(): Promise<TestContext> {
  const s3 = new FakeS3();
  // AppModule 을 오버라이드한 모듈로 createApp 과 같은 미들웨어 구성을 재사용한다
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(S3Service)
    .useValue(s3)
    .compile();
  const app = await createApp(moduleRef);
  await app.init();
  const redis = app.get(RedisService);
  await redis.flushdb();
  return { app, http: supertest(app.getHttpServer()), prisma: app.get(PrismaService), redis, s3 };
}
