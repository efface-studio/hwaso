import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { OrdersService } from './orders.service';

const TICK_MS = 30_000;

/** 주문 워커: 결제 기한 초과 취소 · 자동 배송 완료 · 자동 구매 확정 (경매 워커와 같은 방식으로 실행) */
@Injectable()
export class OrderScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly orders: OrdersService) {}

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
      await this.orders.expireDue();
      await this.orders.autoAdvance();
    } catch (err) {
      this.logger.error({ err }, 'order scheduler tick failed');
    } finally {
      this.running = false;
    }
  }
}
