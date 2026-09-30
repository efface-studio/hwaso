import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AccountModule } from './account/account.controller';
import { AdminModule } from './admin/admin.controller';
import { AuctionsModule } from './auctions/auctions.controller';
import { AuthModule } from './auth/auth.controller';
import { CatalogModule } from './catalog/catalog.controller';
import { ChatModule } from './chat/chat.controller';
import { CommunityModule } from './community/community.controller';
import { AuthGuard } from './common/auth';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RateLimitGuard, RateLimitModule } from './common/rate-limit';
import { HealthModule } from './health/health.controller';
import { MediaModule } from './media/media.controller';
import { MailModule } from './mail/mail.service';
import { NotificationsModule } from './notifications/notifications.controller';
import { OrdersModule } from './orders/orders.controller';
import { OtaModule } from './ota/ota.controller';
import { PrismaModule } from './prisma/prisma.service';
import { ProductsModule } from './products/products.controller';
import { RealtimeEmitterModule } from './realtime/realtime';
import { RedisModule } from './redis/redis.service';
import { SafetyModule } from './safety/safety.controller';
import { StorageModule } from './storage/s3.service';
import { UsersModule } from './users/users.controller';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RateLimitModule,
    StorageModule,
    MailModule,
    AuthModule,
    AccountModule,
    HealthModule,
    MediaModule,
    ProductsModule,
    CatalogModule,
    UsersModule,
    RealtimeEmitterModule,
    NotificationsModule,
    AuctionsModule,
    OrdersModule,
    SafetyModule,
    ChatModule,
    CommunityModule,
    AdminModule,
    OtaModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // 순서 중요: 인증으로 req.user 를 채운 뒤 사용자 기준 rate limit
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
