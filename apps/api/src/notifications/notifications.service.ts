import { Injectable, Logger } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import {
  NOTIFICATION_CATEGORY,
  inQuietHours,
  resolveNotificationPrefs,
  type NotificationDto,
  type NotificationPrefs,
  type Page,
  type PushTokenInput,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime';
import { PushService, type PushMessage } from './push.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown>;
  /** false 면 알림함에 남기지 않고 푸시만 (채팅) */
  store?: boolean;
}

const PAGE = 30;
const PUSH_CONCURRENCY = 10;

export const toNotificationDto = (n: Notification): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/**
 * 알림: 알림함 저장 → 실시간 전송(NOTIFICATION) → 설정에 따라 푸시.
 * 알림 실패가 입찰·결제 같은 본 업무를 막으면 안 되므로 notify 는 예외를 던지지 않는다.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  async notify(userIds: string | (string | null | undefined)[], input: NotifyInput) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter((x): x is string => !!x))];
    if (!ids.length) return;
    try {
      // ponytail: 수신자 전체를 한 번에 저장 — 관심 수천 명 단위 발송이 느려지면 큐(BullMQ)로 분리
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids }, status: { not: 'DELETED' } },
        select: { id: true, notificationPrefs: true },
      });
      if (!users.length) return;
      const category = NOTIFICATION_CATEGORY[input.type];
      const quiet = inQuietHours();
      const created =
        input.store === false
          ? []
          : await this.prisma.notification.createManyAndReturn({
              data: users.map((u) => ({
                userId: u.id,
                type: input.type,
                title: input.title,
                body: input.body,
                link: input.link ?? null,
                data: (input.data ?? undefined) as object | undefined,
              })),
            });

      const pushTo = users
        .filter((u) => {
          const prefs = resolveNotificationPrefs(u.notificationPrefs);
          const allowed = category === 'system' || prefs.push[category];
          return allowed && !(prefs.quietHours && quiet);
        })
        .map((u) => u.id);
      if (pushTo.length)
        void this.sendPushes(pushTo, { title: input.title, body: input.body, link: input.link });

      if (created.length) {
        const counts = await this.prisma.notification.groupBy({
          by: ['userId'],
          where: { userId: { in: created.map((n) => n.userId) }, readAt: null },
          _count: true,
        });
        const unread = new Map(counts.map((c) => [c.userId, c._count]));
        for (const n of created)
          this.realtime.toUser(n.userId, 'NOTIFICATION', {
            notification: toNotificationDto(n),
            unreadCount: unread.get(n.userId) ?? 0,
          });
      }
    } catch (err) {
      this.logger.error({ err, type: input.type }, 'notify failed');
    }
  }

  /** 푸시는 응답을 기다리지 않되, 수신자가 많아도 동시에 PUSH_CONCURRENCY 명까지만 보낸다 */
  private async sendPushes(userIds: string[], msg: PushMessage) {
    for (let i = 0; i < userIds.length; i += PUSH_CONCURRENCY) {
      await Promise.all(
        userIds
          .slice(i, i + PUSH_CONCURRENCY)
          .map((id) =>
            this.push.send(id, msg).catch((err: unknown) => this.logger.warn({ err }, 'push failed')),
          ),
      );
    }
  }

  // ───── 알림함 ─────

  async list(userId: string, cursor?: string): Promise<Page<NotificationDto>> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE);
    return { items: page.map(toNotificationDto), nextCursor: rows.length > PAGE ? page.at(-1)!.id : null };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, input: { ids: string[] } | { all: true }) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...('ids' in input ? { id: { in: input.ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { unreadCount: await this.unreadCount(userId) };
  }

  async remove(userId: string, id: string) {
    const r = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (!r.count) throw new AppException('NOT_FOUND');
    return { unreadCount: await this.unreadCount(userId) };
  }

  /** 읽은 알림 모두 지우기 */
  async clearRead(userId: string) {
    await this.prisma.notification.deleteMany({ where: { userId, readAt: { not: null } } });
    return { ok: true };
  }

  // ───── 설정 · 푸시 토큰 ─────

  async prefs(userId: string): Promise<NotificationPrefs> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    return resolveNotificationPrefs(u.notificationPrefs);
  }

  async setPrefs(userId: string, prefs: NotificationPrefs) {
    await this.prisma.user.update({ where: { id: userId }, data: { notificationPrefs: prefs as object } });
    return prefs;
  }

  /** 같은 기기 토큰이 다른 계정에 있으면 현재 로그인 계정으로 옮긴다 (기기당 한 계정) */
  async registerToken(userId: string, input: PushTokenInput) {
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform },
    });
    return { ok: true };
  }

  async removeToken(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
    return { ok: true };
  }

  pushConfig() {
    return { vapidPublicKey: this.push.webPublicKey() };
  }
}
