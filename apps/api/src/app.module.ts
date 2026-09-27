import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RateLimitGuard, RateLimitService } from './common/rate-limit';
import { HealthModule } from './health/health.controller';
import { MediaModule } from './media/media.controller';
import { PrismaModule } from './prisma/prisma.service';
import { RedisModule } from './redis/redis.service';
import { StorageModule } from './storage/s3.service';

@Module({
  imports: [PrismaModule, RedisModule, StorageModule, HealthModule, MediaModule],
  providers: [
    RateLimitService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // 순서 중요: 인증으로 req.user 를 채운 뒤 사용자 기준 rate limit
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
