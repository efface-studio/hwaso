import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/bootstrap';
import { AppException } from '../src/common/app-exception';
import { PortOneClient, type PortOneIdentity } from '../src/identity/identity.service';
import { MailService, type MailMessage } from '../src/mail/mail.service';
import { PushService, type PushMessage } from '../src/notifications/push.service';
import { TossClient, type TossPayment } from '../src/orders/toss.client';
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

/** 토스페이먼츠 더블: 승인 결과(mode)를 바꿔 가상계좌·실패를 흉내 낸다 */
export class FakeToss {
  mode: 'DONE' | 'WAITING_FOR_DEPOSIT' | 'FAIL' = 'DONE';
  payments = new Map<string, TossPayment>();
  confirms: string[] = [];
  cancels: { paymentKey: string; reason: string }[] = [];
  enabled() {
    return true;
  }
  clientKey() {
    return 'test_ck';
  }
  confirm(paymentKey: string, orderId: string, amount: number) {
    this.confirms.push(paymentKey);
    if (this.mode === 'FAIL')
      return Promise.reject(
        new AppException('PAYMENT_FAILED', '카드 한도 초과', { providerCode: 'REJECT_CARD' }),
      );
    const p: TossPayment = {
      paymentKey,
      orderId,
      status: this.mode,
      totalAmount: amount,
      balanceAmount: amount,
      approvedAt: this.mode === 'DONE' ? new Date().toISOString() : null,
      virtualAccount:
        this.mode === 'WAITING_FOR_DEPOSIT'
          ? { accountNumber: '123', bankCode: '88', customerName: '화소', dueDate: new Date().toISOString() }
          : null,
    };
    this.payments.set(paymentKey, p);
    return Promise.resolve(p);
  }
  /** 입금 완료 등 PG 쪽 상태 변경 */
  settle(paymentKey: string, status: TossPayment['status']) {
    const p = this.payments.get(paymentKey)!;
    this.payments.set(paymentKey, { ...p, status, approvedAt: new Date().toISOString() });
  }
  get(paymentKey: string) {
    const p = this.payments.get(paymentKey);
    return p ? Promise.resolve(p) : Promise.reject(new AppException('NOT_FOUND'));
  }
  cancel(paymentKey: string, reason: string) {
    this.cancels.push({ paymentKey, reason });
    const p = this.payments.get(paymentKey)!;
    const next = { ...p, status: 'CANCELED' as const, balanceAmount: 0 };
    this.payments.set(paymentKey, next);
    return Promise.resolve(next);
  }
}

export class FakePush {
  sent: { userId: string; msg: PushMessage }[] = [];
  send(userId: string, msg: PushMessage) {
    this.sent.push({ userId, msg });
    return Promise.resolve();
  }
  webPublicKey() {
    return null;
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
  toss: FakeToss;
  push: FakePush;
}

export async function createTestApp(): Promise<TestContext> {
  const s3 = new FakeS3();
  const mail = new FakeMail();
  const portone = new FakePortOne();
  const toss = new FakeToss();
  const push = new FakePush();
  // AppModule 을 오버라이드한 모듈로 createApp 과 같은 미들웨어 구성을 재사용한다
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(S3Service)
    .useValue(s3)
    .overrideProvider(MailService)
    .useValue(mail)
    .overrideProvider(PortOneClient)
    .useValue(portone)
    .overrideProvider(TossClient)
    .useValue(toss)
    .overrideProvider(PushService)
    .useValue(push)
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
    toss,
    push,
  };
}
