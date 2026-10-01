import { Body, Controller, Get, Global, HttpCode, Module, Post, Query, Req } from '@nestjs/common';
import { integrityReportSchema, type IntegrityReportInput } from '@shop/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ConsentExempt, CurrentUser, type AuthUser } from '../common/auth';
import { clientIp, RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { ReauthGuard } from './reauth.guard';
import { SecurityService } from './security.service';

const cursorOnly = z.object({ cursor: z.string().max(40).optional() });

@Controller('me/security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  /** 내 보안 기록 (최신순, 30개씩) */
  @Get('events')
  events(@CurrentUser() user: AuthUser, @Query(new ZodPipe(cursorOnly)) q: z.infer<typeof cursorOnly>) {
    return this.security.list(user.id, q.cursor);
  }

  /** 앱이 탐지한 기기 무결성 신호 신고 — 경고만 남기고 이용을 막지 않는다 (약관 동의 전에도 기록한다) */
  @ConsentExempt()
  @Post('integrity')
  @HttpCode(204)
  @RateLimit({ name: 'integrity', limit: 30, windowSec: 3600, by: 'user' })
  async integrity(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(integrityReportSchema)) body: IntegrityReportInput,
    @Req() req: Request,
  ) {
    await this.security.reportIntegrity(user, body, clientIp(req));
  }
}

/** 보안 이벤트·재인증 가드는 인증·계정·결제 모듈이 함께 쓰므로 전역으로 둔다 */
@Global()
@Module({
  controllers: [SecurityController],
  providers: [SecurityService, ReauthGuard],
  exports: [SecurityService, ReauthGuard],
})
export class SecurityModule {}
