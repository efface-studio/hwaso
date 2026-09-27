import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../redis/redis.service';
import { AppException } from './app-exception';
import type { AuthedRequest } from './auth';

export interface RateLimitRule {
  /** 규칙 이름 (Redis 키 prefix) */
  name: string;
  limit: number;
  windowSec: number;
  /** 로그인 사용자 기준 또는 IP 기준 */
  by: 'user' | 'ip';
}

const RATE_LIMIT = 'rate-limit';
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT, rules);

export const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** 고정 창 카운터. 한도를 넘으면 true */
  async exceeded(key: string, limit: number, windowSec: number): Promise<boolean> {
    const k = `rl:${key}`;
    const [[, count]] = (await this.redis.multi().incr(k).expire(k, windowSec, 'NX').exec()) as [
      [null, number],
    ];
    return count > limit;
  }

  async assert(key: string, limit: number, windowSec: number) {
    if (await this.exceeded(key, limit, windowSec)) throw new AppException('RATE_LIMITED');
  }

  reset(key: string) {
    return this.redis.del(`rl:${key}`);
  }
}

/** @RateLimit() 메타데이터가 붙은 핸들러에만 동작한다. 전역 IP 제한은 main.ts 미들웨어 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<RateLimitRule[] | undefined>(RATE_LIMIT, ctx.getHandler());
    if (!rules?.length) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    for (const r of rules) {
      const subject = r.by === 'user' && req.user ? `u:${req.user.id}` : `ip:${clientIp(req)}`;
      await this.limiter.assert(`${r.name}:${subject}`, r.limit, r.windowSec);
    }
    return true;
  }
}
