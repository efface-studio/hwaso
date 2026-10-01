import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { liftExpiredSuspension } from '../common/suspension';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const TICK_MS = 60_000;

/**
 * 기간 정지 해제 워커: 종료 시각이 지난 정지를 풀어 관리자 화면·통계가 맞게 한다.
 * 로그인할 때도 같은 검사를 하므로(common/suspension) 워커가 늦어도 회원은 바로 로그인할 수 있다.
 */
@Injectable()
export class SuspensionScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SuspensionScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.SCHEDULER_ENABLED === 'false' || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.user.findMany({
        where: { status: 'SUSPENDED', suspendedUntil: { lte: new Date() } },
        select: { id: true, status: true, statusReason: true, suspendedUntil: true },
        take: 200,
      });
      for (const u of due) await liftExpiredSuspension(this.prisma, this.redis, u);
      if (due.length) this.logger.log(`lifted ${due.length} expired suspensions`);
    } catch (err) {
      this.logger.error({ err }, 'suspension scheduler tick failed');
    } finally {
      this.running = false;
    }
  }
}
