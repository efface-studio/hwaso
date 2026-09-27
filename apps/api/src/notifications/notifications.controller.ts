import {
  Body,
  Controller,
  Delete,
  Get,
  Global,
  HttpCode,
  Module,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  notificationPrefsSchema,
  notificationReadSchema,
  pushTokenSchema,
  type NotificationPrefs,
  type PushTokenInput,
} from '@shop/shared';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { NotificationEvents } from './notification-events';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

const cursorSchema = z.object({ cursor: z.string().max(40).optional() });
const tokenSchema = z.strictObject({ token: z.string().min(10).max(2000) });

@Controller()
export class NotificationsController {
  constructor(private readonly n: NotificationsService) {}

  @Get('notifications')
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(cursorSchema)) q: { cursor?: string }) {
    return this.n.list(u.id, q.cursor);
  }

  @Get('notifications/unread-count')
  async unread(@CurrentUser() u: AuthUser) {
    return { unreadCount: await this.n.unreadCount(u.id) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  read(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(notificationReadSchema)) body: { ids: string[] } | { all: true },
  ) {
    return this.n.markRead(u.id, body);
  }

  @Delete('notifications/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.n.remove(u.id, id);
  }

  @Delete('notifications')
  clear(@CurrentUser() u: AuthUser) {
    return this.n.clearRead(u.id);
  }

  @Public()
  @Get('notifications/push-config')
  pushConfig() {
    return this.n.pushConfig();
  }

  @Get('me/notification-settings')
  prefs(@CurrentUser() u: AuthUser) {
    return this.n.prefs(u.id);
  }

  @Put('me/notification-settings')
  setPrefs(@CurrentUser() u: AuthUser, @Body(new ZodPipe(notificationPrefsSchema)) body: NotificationPrefs) {
    return this.n.setPrefs(u.id, body);
  }

  @Post('me/push-tokens')
  @HttpCode(200)
  register(@CurrentUser() u: AuthUser, @Body(new ZodPipe(pushTokenSchema)) body: PushTokenInput) {
    return this.n.registerToken(u.id, body);
  }

  /** 로그아웃·알림 끄기 시 이 기기 토큰 해제 */
  @Delete('me/push-tokens')
  unregister(@CurrentUser() u: AuthUser, @Body(new ZodPipe(tokenSchema)) body: { token: string }) {
    return this.n.removeToken(u.id, body.token);
  }
}

/** 어느 모듈에서든 알림을 보낼 수 있게 전역 모듈로 둔다 (API·워커 공통) */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEvents, PushService],
  exports: [NotificationsService, NotificationEvents, PushService],
})
export class NotificationsModule {}

/** 워커용: 컨트롤러 없이 서비스만 */
@Global()
@Module({
  providers: [NotificationsService, NotificationEvents, PushService],
  exports: [NotificationsService, NotificationEvents, PushService],
})
export class NotificationsCoreModule {}
