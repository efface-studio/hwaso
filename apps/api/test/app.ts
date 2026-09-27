import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/bootstrap';
import { PortOneClient, type PortOneIdentity } from '../src/identity/identity.service';
import { MailService, type MailMessage } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { S3Service } from '../src/storage/s3.service';

/** 외부 연동(S3·메일·PortOne)은 메모리 더블로 교체한다. DB·Redis 는 실제로 쓴다 */
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

export class FakeMail {
  sent: MailMessage[] = [];
  send(msg: MailMessage) {
    this.sent.push(msg);
    return Promise.resolve();
  }
  /** 마지막으로 받은 인증번호 */
  lastCode(to: string): string | undefined {
    const msg = [...this.sent].reverse().find((m) => m.to === to && /인증번호: \d{6}/.test(m.text));
    return msg?.text.match(/인증번호: (\d{6})/)?.[1];
  }
}

export class FakePortOne {
  results = new Map<string, PortOneIdentity>();
  getIdentityVerification(id: string) {
    return Promise.resolve(this.results.get(id) ?? { status: 'FAILED' as const });
  }
}

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof supertest>;
  prisma: PrismaService;
  redis: RedisService;
  s3: FakeS3;
  mail: FakeMail;
  portone: FakePortOne;
}

export async function createTestApp(): Promise<TestContext> {
  const s3 = new FakeS3();
  const mail = new FakeMail();
  const portone = new FakePortOne();
  // AppModule 을 오버라이드한 모듈로 createApp 과 같은 미들웨어 구성을 재사용한다
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(S3Service)
    .useValue(s3)
    .overrideProvider(MailService)
    .useValue(mail)
    .overrideProvider(PortOneClient)
    .useValue(portone)
    .compile();
  const app = await createApp(moduleRef);
  await app.init();
  const redis = app.get(RedisService);
  await redis.flushdb();
  return {
    app,
    http: supertest(app.getHttpServer()),
    prisma: app.get(PrismaService),
    redis,
    s3,
    mail,
    portone,
  };
}
