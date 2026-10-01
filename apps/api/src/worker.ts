import './common/serialize';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SuspensionScheduler } from './admin/suspension-scheduler';
import { AuctionScheduler } from './auctions/auction-scheduler';
import { logger } from './common/logger';
import { NotificationsCoreModule } from './notifications/notifications.controller';
import { OrderScheduler } from './orders/order-scheduler';
import { OrdersService } from './orders/orders.service';
import { PaymentsService } from './orders/payments.service';
import { TossClient } from './orders/toss.client';
import { PinoNestLogger } from './common/nest-logger';
import { PrismaModule } from './prisma/prisma.service';
import { RealtimeEmitterModule } from './realtime/realtime';
import { RedisModule } from './redis/redis.service';

/** 운영: API 는 SCHEDULER_ENABLED=false 로 띄우고 이 워커를 별도 프로세스로 실행한다 */
@Module({
  imports: [PrismaModule, RedisModule, RealtimeEmitterModule, NotificationsCoreModule],
  providers: [
    AuctionScheduler,
    OrderScheduler,
    SuspensionScheduler,
    OrdersService,
    PaymentsService,
    TossClient,
  ],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: new PinoNestLogger() });
  app.enableShutdownHooks();
  logger.info('worker started');
}

main().catch((err) => {
  logger.fatal({ err }, 'worker 기동 실패');
  process.exit(1);
});
