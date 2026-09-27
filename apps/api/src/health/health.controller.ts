import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);
    return { status: 'ok' };
  }

  /** 클라이언트 시계 보정용 서버 시각 (docs/AUCTION.md §9) */
  @Public()
  @Get('time')
  time() {
    return { serverTime: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
