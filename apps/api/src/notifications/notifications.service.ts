import { Injectable, Logger } from '@nestjs/common';
import type { Notification, NotificationType, Prisma } from '@prisma/client';
import {
  ADMIN_ROLES,
  NOTIFICATION_CATEGORY,
  inQuietHours,
  resolveAdminNotificationPrefs,
  resolveNotificationPrefs,
  type Role,
  type NotificationDto,
  type NotificationPrefs,
  type Page,
  type PushTokenInput,
} from '@shop/shared';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime';
import { env } from '../config/env';
import { PushService, type PushMessage, type PushSender } from './push.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown>;
  /** false 면 알림함에 남기지 않고 푸시만 (채팅) */
  store?: boolean;
  /** 보낸 사람 (푸시에 이름·프로필 사진) */
  sender?: PushSender | null;
  /** 같은 대화·대상 푸시를 묶는 키 */
  threadId?: string | null;
  /** false 면 푸시 없이 알림함에만 (야간 광고성 알림 등) */
  push?: boolean;
}

const PAGE = 30;
const PUSH_CONCURRENCY = 10;

/** 알림함 목록에 필요한 열만 (data JSON 등 제외) */
const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const satisfies Prisma.NotificationSelect;

export const toNotificationDto = (
  n: Pick<Notification, keyof typeof notificationSelect>,
): NotificationDto => ({
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

      const pushTo = (input.push === false ? [] : users)
        .filter((u) => {
          const prefs = resolveNotificationPrefs(u.notificationPrefs);
          // 관리자 알림은 받는 사람을 고를 때 관리자 설정으로 이미 걸렀다 (admin-notifier)
          const allowed = category === 'system' || category === 'admin' || prefs.push[category];
          return allowed && !(prefs.quietHours && quiet);
        })
        .map((u) => u.id);
      if (pushTo.length)
        void this.sendPushes(pushTo, {
          title: input.title,
          body: input.body,
          link: input.link,
          sender: input.sender,
          threadId: input.threadId,
        });

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

  /** 푸시에 보여줄 보낸 사람 — 닉네임과 프로필 사진(있을 때) */
  async senderOf(userId: string | null | undefined): Promise<PushSender | null> {
    if (!userId) return null;
    const p = await this.prisma.profile.findUnique({
      where: { userId },
      select: { nickname: true, avatarKey: true },
    });
    if (!p) return null;
    return {
      id: userId,
      name: p.nickname,
      avatarUrl: p.avatarKey ? `${env().MEDIA_PUBLIC_URL}/${p.avatarKey}/w400.webp` : null,
    };
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
      select: notificationSelect,
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

  /** 관리자에게만 관리자 알림 설정(admin)을 함께 돌려준다 */
  private prefsView(raw: unknown, role: Role): NotificationPrefs {
    const prefs = resolveNotificationPrefs(raw);
    if (!ADMIN_ROLES.includes(role)) return prefs;
    return { ...prefs, admin: resolveAdminNotificationPrefs((raw as { admin?: unknown } | null)?.admin) };
  }

  async prefs(user: { id: string; role: Role }): Promise<NotificationPrefs> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { notificationPrefs: true },
    });
    return this.prefsView(u.notificationPrefs, user.role);
  }

  /**
   * 관리자가 아니면 admin 은 무시한다(저장하지 않음). 관리자가 admin 을 빼고 보내면(이전 앱) 저장된 값을 유지한다
   */
  async setPrefs(user: { id: string; role: Role }, input: NotificationPrefs) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { notificationPrefs: true },
    });
    const stored = (u.notificationPrefs as { admin?: unknown } | null)?.admin;
    const admin = ADMIN_ROLES.includes(user.role) && input.admin ? input.admin : stored;
    const next = { push: input.push, quietHours: input.quietHours, ...(admin ? { admin } : {}) };
    await this.prisma.user.update({ where: { id: user.id }, data: { notificationPrefs: next as object } });
    return this.prefsView(next, user.role);
  }

  /** 같은 기기 토큰이 다른 계정에 있으면 현재 로그인 계정으로 옮긴다 (기기당 한 계정) */
  async registerToken(userId: string, input: PushTokenInput) {
    const existing = await this.prisma.pushToken.findUnique({ where: { token: input.token } });
    // 샌드박스로 확인된 iOS 토큰은 다시 등록돼도 그 사실을 유지한다 (매번 운영 서버부터 시도하지 않게)
    const platform =
      existing?.platform === 'apns-sandbox' && input.platform === 'apns' ? 'apns-sandbox' : input.platform;
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform },
      update: { userId, platform },
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
