import { Injectable } from '@nestjs/common';
import type { Banner, Notice } from '@prisma/client';
import {
  inQuietHours,
  type AdminBannerRow,
  type BannerInput,
  type BroadcastInput,
  type NoticeDto,
  type NoticeInput,
  type Paged,
  type PageQuery,
} from '@shop/shared';
import { Clock } from '../common/clock';
import { AppException } from '../common/app-exception';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { HOME_CACHE_KEY } from '../products/products.service';
import { RedisService } from '../redis/redis.service';
import { AuditService, type AuditContext } from './audit.service';

const toBanner = (b: Banner): AdminBannerRow => {
  const now = Date.now();
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    tone: b.tone === 'light' ? 'light' : 'dark',
    imageKey: b.imageKey,
    link: b.link,
    placement: 'home',
    sortOrder: b.sortOrder,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    isActive: b.isActive,
    live: b.isActive && b.startsAt.getTime() <= now && b.endsAt.getTime() > now,
  };
};

export const toNotice = (n: Notice): NoticeDto => ({
  id: n.id,
  title: n.title,
  body: n.body,
  isPinned: n.isPinned,
  publishedAt: n.publishedAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
});

/** 배너 · 공지 · 전체 알림 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  async banners() {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toBanner);
  }

  private bannerData(b: BannerInput) {
    return { ...b, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) };
  }

  async createBanner(ctx: AuditContext, input: BannerInput) {
    const b = await this.prisma.banner.create({ data: this.bannerData(input) });
    await this.redis.del(HOME_CACHE_KEY);
    await this.audit.log(ctx, 'banner.create', 'BANNER', b.id, null, input);
    return toBanner(b);
  }

  async updateBanner(ctx: AuditContext, id: string, input: BannerInput) {
    const before = await this.prisma.banner.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    const b = await this.prisma.banner.update({ where: { id }, data: this.bannerData(input) });
    await this.redis.del(HOME_CACHE_KEY);
    await this.audit.log(ctx, 'banner.update', 'BANNER', id, toBanner(before), input);
    return toBanner(b);
  }

  async deleteBanner(ctx: AuditContext, id: string) {
    const before = await this.prisma.banner.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    await this.prisma.banner.delete({ where: { id } });
    await this.redis.del(HOME_CACHE_KEY);
    await this.audit.log(ctx, 'banner.delete', 'BANNER', id, toBanner(before), null);
    return { ok: true };
  }

  // ───── 공지 (공개 목록은 publishedAt 이 지난 것만) ─────

  async notices(q: PageQuery, publicOnly: boolean): Promise<Paged<NoticeDto>> {
    const where = {
      ...(publicOnly ? { publishedAt: { lte: new Date() } } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notice.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.prisma.notice.count({ where }),
    ]);
    return { items: rows.map(toNotice), total, page: q.page, size: q.size };
  }

  async notice(id: string, publicOnly: boolean) {
    const n = await this.prisma.notice.findUnique({ where: { id } });
    if (!n || (publicOnly && n.publishedAt > new Date())) throw new AppException('NOT_FOUND');
    return toNotice(n);
  }

  async createNotice(ctx: AuditContext, input: NoticeInput) {
    const n = await this.prisma.notice.create({
      data: { ...input, publishedAt: input.publishedAt ? new Date(input.publishedAt) : new Date() },
    });
    await this.redis.del(HOME_CACHE_KEY);
    await this.audit.log(ctx, 'notice.create', 'NOTICE', n.id, null, { title: input.title });
    return toNotice(n);
  }

  async updateNotice(ctx: AuditContext, id: string, input: NoticeInput) {
    const before = await this.prisma.notice.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    const n = await this.prisma.notice.update({
      where: { id },
      data: { ...input, publishedAt: input.publishedAt ? new Date(input.publishedAt) : before.publishedAt },
    });
    await this.redis.del(HOME_CACHE_KEY);
    await this.audit.log(ctx, 'notice.update', 'NOTICE', id, { title: before.title }, { title: input.title });
    return toNotice(n);
  }

  async deleteNotice(ctx: AuditContext, id: string) {
    const before = await this.prisma.notice.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    await this.prisma.notice.delete({ where: { id } });
    await this.redis.del(HOME_CACHE_KEY);
    await this.audit.log(ctx, 'notice.delete', 'NOTICE', id, { title: before.title }, null);
    return { ok: true };
  }

  /**
   * 전체 알림 (운영 공지·점검 안내). 알림함 + 푸시.
   * ponytail: 수신자를 한 번에 조회해 순차 발송 — 수만 명 규모면 큐로 나눠 보낸다
   */
  async broadcast(ctx: AuditContext, input: BroadcastInput) {
    // 광고성 정보(정보통신망법 제50조): 수신 동의자에게만, 제목 앞 (광고), 21시~8시(KST)에는 푸시하지 않고 알림함에만
    const marketing = input.kind === 'MARKETING';
    const night = marketing && inQuietHours(this.clock.now());
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        ...(marketing ? { marketingOptIn: true } : {}),
        ...(input.audience === 'sellers' ? { seller: { isNot: null } } : {}),
        ...(input.audience === 'buyers' ? { seller: { is: null } } : {}),
      },
      select: { id: true },
    });
    await this.audit.log(ctx, 'notification.broadcast', 'NOTIFICATION', input.audience, null, {
      ...input,
      kind: input.kind ?? 'NOTICE',
      recipients: users.length,
      pushed: !night,
    });
    void this.notifications.notify(
      users.map((u) => u.id),
      {
        type: 'SYSTEM',
        title: marketing ? `(광고) ${input.title}` : input.title,
        body: marketing ? `${input.body}\n수신거부: 마이 › 설정` : input.body,
        link: input.link,
        push: !night,
      },
    );
    return { recipients: users.length, pushed: !night };
  }
}
