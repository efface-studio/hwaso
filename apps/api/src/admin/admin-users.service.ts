import { Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import type { AdminUserDetail, AdminUserRow, AdminUsersQuery, Paged, PageQuery } from '@shop/shared';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/app-exception';
import { invalidateUserStatus } from '../common/auth';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService, type AuditContext } from './audit.service';

const rowSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  statusReason: true,
  identityVerifiedAt: true,
  unpaidStrikes: true,
  createdAt: true,
  profile: { select: { nickname: true } },
  seller: { select: { verifiedAt: true } },
  sessions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof rowSelect }>;

const toRow = (u: Row): AdminUserRow => ({
  id: u.id,
  email: u.email,
  nickname: u.profile?.nickname ?? '(프로필 없음)',
  role: u.role,
  status: u.status,
  statusReason: u.statusReason,
  identityVerified: !!u.identityVerifiedAt,
  unpaidStrikes: u.unpaidStrikes,
  isSeller: !!u.seller,
  sellerVerifiedAt: u.seller?.verifiedAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.sessions[0]?.createdAt.toISOString() ?? null,
});

const ADMINS: Role[] = ['ADMIN', 'SUPER_ADMIN'];

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  private search(q?: string): Prisma.UserWhereInput {
    if (!q) return {};
    return {
      OR: [
        { id: q },
        { email: { contains: q, mode: 'insensitive' } },
        { profile: { nickname: { contains: q, mode: 'insensitive' } } },
      ],
    };
  }

  private async page(where: Prisma.UserWhereInput, q: PageQuery): Promise<Paged<AdminUserRow>> {
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: rowSelect,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toRow), total, page: q.page, size: q.size };
  }

  list(q: AdminUsersQuery) {
    return this.page(
      {
        ...this.search(q.q),
        ...(q.role ? { role: q.role } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      q,
    );
  }

  sellers(q: PageQuery & { verified: 'all' | 'pending' | 'verified' }) {
    const seller =
      q.verified === 'all'
        ? { isNot: null }
        : { is: { verifiedAt: q.verified === 'pending' ? null : { not: null } } };
    return this.page({ ...this.search(q.q), seller }, q);
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...rowSelect,
        profile: true,
        seller: true,
        socialAccounts: { select: { provider: true } },
        _count: { select: { products: true, ordersBought: true, ordersSold: true, bids: true } },
      },
    });
    if (!u) throw new AppException('NOT_FOUND');
    const reportsAgainst = await this.prisma.report.count({ where: { targetType: 'USER', targetId: id } });
    return {
      ...toRow({ ...u, profile: u.profile && { nickname: u.profile.nickname } }),
      profile: {
        bio: u.profile?.bio ?? '',
        region: u.profile?.region ?? null,
        ratingAvg: u.profile?.ratingAvg ?? 0,
        ratingCount: u.profile?.ratingCount ?? 0,
        tradeCount: u.profile?.tradeCount ?? 0,
      },
      seller: u.seller && {
        businessName: u.seller.businessName,
        bankName: u.seller.bankName,
        bankAccountMasked: u.seller.bankAccountMasked,
        accountHolder: u.seller.accountHolder,
      },
      counts: {
        products: u._count.products,
        ordersBought: u._count.ordersBought,
        ordersSold: u._count.ordersSold,
        bids: u._count.bids,
        reportsAgainst,
      },
      socialProviders: u.socialAccounts.map((s) => s.provider),
    };
  }

  /** 관리자끼리의 조치 제한: 최고 관리자만 관리자를 다룰 수 있고, 자기 자신은 바꿀 수 없다 */
  private async target(ctx: AuditContext, id: string) {
    if (id === ctx.user.id) throw new AppException('FORBIDDEN', '본인 계정에는 사용할 수 없습니다.');
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.status === 'DELETED') throw new AppException('NOT_FOUND');
    if (ADMINS.includes(u.role) && ctx.user.role !== 'SUPER_ADMIN')
      throw new AppException('FORBIDDEN', '관리자 계정은 최고 관리자만 변경할 수 있습니다.');
    return u;
  }

  /** 정지: 모든 기기에서 로그아웃되고 로그인 시 사유가 안내된다 */
  async suspend(ctx: AuditContext, id: string, reason: string) {
    const u = await this.target(ctx, id);
    await this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED', statusReason: reason } });
    await this.sessions.revokeAll(id);
    await this.audit.log(
      ctx,
      'user.suspend',
      'USER',
      id,
      { status: u.status },
      { status: 'SUSPENDED', reason },
    );
    return this.detail(id);
  }

  async restore(ctx: AuditContext, id: string, reason: string) {
    const u = await this.target(ctx, id);
    if (u.status !== 'SUSPENDED') throw new AppException('INVALID_TRANSITION');
    await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', statusReason: null } });
    await invalidateUserStatus(this.redis, id);
    await this.audit.log(
      ctx,
      'user.restore',
      'USER',
      id,
      { status: 'SUSPENDED' },
      { status: 'ACTIVE', reason },
    );
    await this.notifications.notify(id, {
      type: 'SYSTEM',
      title: '계정 이용 제한이 해제되었어요',
      body: reason,
      link: '/',
    });
    return this.detail(id);
  }

  async setRole(ctx: AuditContext, id: string, role: Role) {
    const u = await this.target(ctx, id);
    if (role === 'SUPER_ADMIN')
      throw new AppException('FORBIDDEN', '최고 관리자는 추가로 지정할 수 없습니다.');
    if (ADMINS.includes(role) && ctx.user.role !== 'SUPER_ADMIN')
      throw new AppException('FORBIDDEN', '관리자 권한은 최고 관리자만 부여할 수 있습니다.');
    const isSeller = await this.prisma.seller.count({ where: { userId: id } });
    if ((role === 'SELLER' || role === 'VERIFIED_SELLER') && !isSeller)
      throw new AppException('SELLER_REQUIRED', '판매자 등록(정산 계좌)을 먼저 해야 합니다.', undefined, 409);
    await this.prisma.user.update({ where: { id }, data: { role } });
    await invalidateUserStatus(this.redis, id);
    await this.audit.log(ctx, 'user.role', 'USER', id, { role: u.role }, { role });
    return this.detail(id);
  }

  /** 낙찰 미결제 제한 해제 */
  async resetStrikes(ctx: AuditContext, id: string, reason: string) {
    const u = await this.target(ctx, id);
    await this.prisma.user.update({ where: { id }, data: { unpaidStrikes: 0 } });
    await this.audit.log(
      ctx,
      'user.reset_strikes',
      'USER',
      id,
      { unpaidStrikes: u.unpaidStrikes },
      { unpaidStrikes: 0, reason },
    );
    return this.detail(id);
  }

  /** 판매자 인증 ↔ 인증 해제 */
  async verifySeller(ctx: AuditContext, id: string, verified: boolean) {
    const s = await this.prisma.seller.findUnique({ where: { userId: id }, include: { user: true } });
    if (!s) throw new AppException('NOT_FOUND', '판매자 등록 정보가 없습니다.');
    await this.prisma.seller.update({
      where: { userId: id },
      data: { verifiedAt: verified ? new Date() : null },
    });
    if (!ADMINS.includes(s.user.role))
      await this.prisma.user.update({
        where: { id },
        data: { role: verified ? 'VERIFIED_SELLER' : 'SELLER' },
      });
    await invalidateUserStatus(this.redis, id);
    await this.audit.log(
      ctx,
      verified ? 'seller.verify' : 'seller.unverify',
      'USER',
      id,
      { verifiedAt: s.verifiedAt },
      { verified },
    );
    if (verified)
      await this.notifications.notify(id, {
        type: 'SYSTEM',
        title: '인증 판매자가 되었어요',
        body: '프로필과 작품에 인증 판매자 표시가 붙어요.',
        link: '/seller',
      });
    return this.detail(id);
  }
}
