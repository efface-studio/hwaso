import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import {
  ERROR_MESSAGES,
  SUSPEND_MAX_DAYS,
  type AdminCreateUserInput,
  type AdminCreateUserResult,
  type AdminUpdateUserInput,
  type AdminUserDetail,
  type AdminUserRow,
  type AdminUsersQuery,
  type Paged,
  type PageQuery,
} from '@shop/shared';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/app-exception';
import { hasRequiredConsent, invalidateUserStatus } from '../common/auth';
import { assertClean } from '../common/moderation';
import { maskEmail } from '../common/log-redact';
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
  suspendedUntil: true,
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
  suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
  identityVerified: !!u.identityVerifiedAt,
  unpaidStrikes: u.unpaidStrikes,
  isSeller: !!u.seller,
  sellerVerifiedAt: u.seller?.verifiedAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.sessions[0]?.createdAt.toISOString() ?? null,
});

const ADMINS: Role[] = ['ADMIN', 'SUPER_ADMIN'];
/** 역할 높낮이 — 관리자 역할에서 내려가면 강등으로 보고 세션을 끊는다 */
const RANK: Record<Role, number> = { USER: 0, SELLER: 1, VERIFIED_SELLER: 2, ADMIN: 3, SUPER_ADMIN: 4 };

/** 임시 비밀번호: 헷갈리는 글자(0·O·1·l·I)를 뺀 14자, 영문·숫자를 반드시 포함 (passwordSchema 충족) */
const PW_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PW_DIGITS = '23456789';
function temporaryPassword(): string {
  const all = PW_LETTERS + PW_DIGITS;
  const chars = Array.from({ length: 12 }, () => all[randomInt(all.length)]!);
  chars.splice(randomInt(chars.length + 1), 0, PW_LETTERS[randomInt(PW_LETTERS.length)]!);
  chars.splice(randomInt(chars.length + 1), 0, PW_DIGITS[randomInt(PW_DIGITS.length)]!);
  return chars.join('');
}

/** 내부용 주소(소셜 임시·탈퇴)는 관리자가 넣을 수 없다 */
const assertRealEmail = (email: string) => {
  if (email.endsWith('.invalid'))
    throw new AppException('VALIDATION_FAILED', '사용할 수 없는 이메일입니다.', {
      fields: { email: '사용할 수 없는 이메일입니다.' },
    });
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
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
        emailVerifiedAt: true,
        // 값은 내보내지 않고 비밀번호 로그인 가능 여부만 본다
        passwordHash: true,
        termsAgreedAt: true,
        privacyAgreedAt: true,
        ageConfirmedAt: true,
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
      emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
      consentRequired: !hasRequiredConsent(u),
      hasPassword: !!u.passwordHash,
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

  /** 역할 부여 규칙 (역할 변경·계정 생성 공용): 관리자·최고 관리자는 최고 관리자만, 판매자는 판매자 등록이 먼저 */
  private async assertGrantable(ctx: AuditContext, role: Role, userId?: string) {
    if (ADMINS.includes(role) && ctx.user.role !== 'SUPER_ADMIN')
      throw new AppException('FORBIDDEN', '관리자 권한은 최고 관리자만 부여할 수 있습니다.');
    if (role === 'SELLER' || role === 'VERIFIED_SELLER') {
      const isSeller = userId ? await this.prisma.seller.count({ where: { userId } }) : 0;
      if (!isSeller)
        throw new AppException(
          'SELLER_REQUIRED',
          '판매자 등록(정산 계좌)을 먼저 해야 합니다.',
          undefined,
          409,
        );
    }
  }

  /**
   * 관리자 계정을 줄이는 조치(강등·정지·삭제)는 최고 관리자 행을 잠근 트랜잭션 안에서 검사한다 —
   * 두 최고 관리자가 동시에 서로를 강등해 0명이 되는 일을 막는다. 처리자도 지금 DB 에서 최고 관리자인지 다시 본다
   * (역할 캐시는 30초까지 늦을 수 있다).
   */
  private async lockAdmins(
    tx: Prisma.TransactionClient,
    ctx: AuditContext,
    target: { id: string; role: Role },
  ) {
    const supers = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' FOR UPDATE`;
    if (target.role === 'SUPER_ADMIN' && !supers.some((s) => s.id !== target.id))
      throw new AppException(
        'CONFLICT',
        '마지막 최고 관리자는 강등·정지·삭제할 수 없습니다.',
        { reason: 'LAST_SUPER_ADMIN' },
        409,
      );
    if (!supers.some((s) => s.id === ctx.user.id))
      throw new AppException('FORBIDDEN', '관리자 계정은 최고 관리자만 변경할 수 있습니다.');
  }

  /** 대상이 관리자면 잠금 검사 후, 아니면 바로 쓴다 */
  private write<T>(
    ctx: AuditContext,
    target: { id: string; role: Role },
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (ADMINS.includes(target.role)) await this.lockAdmins(tx, ctx, target);
      return fn(tx);
    });
  }

  /**
   * 정지: 모든 기기에서 로그아웃되고 로그인 시 기간·사유가 안내된다. until 이 null 이면 영구, 있으면 그 시각이 지난 뒤
   * 첫 로그인(또는 워커)에서 풀린다. 정지 중에 다시 부르면 기간·사유를 바꾼다.
   */
  async suspend(ctx: AuditContext, id: string, reason: string, until: string | null = null) {
    const u = await this.target(ctx, id);
    const end = until ? new Date(until) : null;
    const now = Date.now();
    if (end && (end.getTime() < now + 60_000 || end.getTime() > now + SUSPEND_MAX_DAYS * 86_400_000)) {
      const message = '정지 종료 일시를 확인해주세요. (지금 이후 ~ 5년 이내)';
      throw new AppException('VALIDATION_FAILED', message, { fields: { until: message } });
    }
    await this.write(ctx, u, (tx) =>
      tx.user.update({
        where: { id },
        data: { status: 'SUSPENDED', statusReason: reason, suspendedUntil: end },
      }),
    );
    await this.sessions.revokeAll(id);
    await this.audit.log(
      ctx,
      'user.suspend',
      'USER',
      id,
      { status: u.status, until: u.suspendedUntil?.toISOString() ?? null },
      {
        status: 'SUSPENDED',
        reason,
        until: end?.toISOString() ?? null,
        // 영구는 null. 기간은 일 단위(소수 1자리)로 함께 남긴다
        days: end ? Math.round(((end.getTime() - now) / 86_400_000) * 10) / 10 : null,
      },
    );
    return this.detail(id);
  }

  async restore(ctx: AuditContext, id: string, reason: string) {
    const u = await this.target(ctx, id);
    if (u.status !== 'SUSPENDED') throw new AppException('INVALID_TRANSITION');
    await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', statusReason: null, suspendedUntil: null },
    });
    await invalidateUserStatus(this.redis, id);
    await this.audit.log(
      ctx,
      'user.restore',
      'USER',
      id,
      { status: 'SUSPENDED', until: u.suspendedUntil?.toISOString() ?? null },
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

  /**
   * 역할 변경. 관리자·최고 관리자 부여와 관리자 계정 변경은 최고 관리자만 (본인 제외).
   * 관리자 역할에서 내려가면 모든 기기 세션(생체 키 포함)을 끊어 바로 반영한다.
   */
  async setRole(ctx: AuditContext, id: string, role: Role) {
    const u = await this.target(ctx, id);
    await this.assertGrantable(ctx, role, id);
    const demoted = ADMINS.includes(u.role) && RANK[role] < RANK[u.role];
    await this.write(ctx, u, (tx) => tx.user.update({ where: { id }, data: { role } }));
    if (demoted) await this.sessions.revokeAll(id);
    await invalidateUserStatus(this.redis, id);
    await this.audit.log(ctx, 'user.role', 'USER', id, { role: u.role }, { role, sessionsRevoked: demoted });
    return this.detail(id);
  }

  // ───── 계정 생성 · 정보 수정 · 삭제 ─────

  /**
   * 관리자 계정 생성: 인증 메일 없이 이메일 인증 완료로 만든다. 필수 동의는 비워 두어 첫 로그인 때 동의 화면을 거친다.
   * 비밀번호를 주지 않으면 임시 비밀번호를 만들어 이 응답에서만 돌려준다 (저장은 해시만).
   */
  async create(ctx: AuditContext, input: AdminCreateUserInput): Promise<AdminCreateUserResult> {
    const role = input.role ?? 'USER';
    await this.assertGrantable(ctx, role);
    assertClean({ nickname: input.nickname });
    assertRealEmail(input.email);
    await this.assertEmailFree(input.email);
    await this.assertNicknameFree(input.nickname);

    const generated = input.password ? null : temporaryPassword();
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await AuthService.hashPassword(input.password ?? generated!),
        emailVerifiedAt: new Date(),
        role,
        profile: { create: { nickname: input.nickname } },
      },
      select: { id: true },
    });
    await this.audit.log(ctx, 'user.create', 'USER', user.id, null, {
      email: input.email,
      nickname: input.nickname,
      role,
      emailVerified: true,
      passwordGenerated: !!generated,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return { user: await this.detail(user.id), temporaryPassword: generated };
  }

  /** 회원 정보 수정 (닉네임·이메일·인증 여부·소개·지역·상호). 바뀐 값만 before/after 로 남긴다 */
  async update(ctx: AuditContext, id: string, input: AdminUpdateUserInput) {
    const u = await this.target(ctx, id);
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { profile: true, seller: { select: { businessName: true } } },
    });
    assertClean({ nickname: input.nickname, bio: input.bio, region: input.region ?? undefined });

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const user: Prisma.UserUpdateInput = {};
    const profile: Prisma.ProfileUpdateInput = {};
    const diff = (key: string, from: unknown, to: unknown) => {
      if (to === undefined || from === to) return false;
      before[key] = from;
      after[key] = to;
      return true;
    };

    if (diff('nickname', current.profile?.nickname, input.nickname)) {
      await this.assertNicknameFree(input.nickname!, id);
      profile.nickname = input.nickname;
    }
    if (diff('bio', current.profile?.bio ?? '', input.bio)) profile.bio = input.bio;
    if (diff('region', current.profile?.region ?? null, input.region)) profile.region = input.region;

    const emailChanged = diff('email', u.email, input.email);
    if (emailChanged) {
      assertRealEmail(input.email!);
      await this.assertEmailFree(input.email!, id);
      user.email = input.email;
    }
    // 새 주소는 관리자가 인증 완료로 고르지 않으면 인증 전으로 둔다. 주소가 그대로면 고른 값이 다를 때만 바꾼다
    const wasVerified = !!u.emailVerifiedAt;
    const verified = emailChanged ? (input.emailVerified ?? false) : input.emailVerified;
    if (verified !== undefined && (emailChanged || verified !== wasVerified)) {
      before.emailVerified = wasVerified;
      after.emailVerified = verified;
      user.emailVerifiedAt = verified ? new Date() : null;
    }

    let businessName: string | null | undefined;
    if (input.businessName !== undefined) {
      if (!current.seller)
        throw new AppException(
          'SELLER_REQUIRED',
          '판매자 등록 회원만 상호를 바꿀 수 있습니다.',
          undefined,
          409,
        );
      if (diff('businessName', current.seller.businessName, input.businessName || null))
        businessName = input.businessName || null;
    }

    if (!Object.keys(after).length) return this.detail(id);
    await this.prisma.$transaction([
      ...(Object.keys(user).length ? [this.prisma.user.update({ where: { id }, data: user })] : []),
      ...(Object.keys(profile).length
        ? [this.prisma.profile.update({ where: { userId: id }, data: profile })]
        : []),
      ...(businessName !== undefined
        ? [this.prisma.seller.update({ where: { userId: id }, data: { businessName } })]
        : []),
    ]);
    await this.audit.log(ctx, 'user.update', 'USER', id, before, {
      ...after,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return this.detail(id);
  }

  /**
   * 회원 삭제: 회원 탈퇴와 같은 익명화(AuthService.anonymizeAccount)를 쓰고, 진행 중 거래가 있으면 같은 조건으로 막는다.
   * 관리자 계정은 최고 관리자만, 마지막 최고 관리자는 삭제할 수 없다.
   */
  async remove(ctx: AuditContext, id: string, reason: string) {
    const u = await this.target(ctx, id);
    const trades = await this.auth.activeTrades(id);
    if (trades.orders || trades.auctions || trades.highest)
      throw new AppException(
        'ACCOUNT_HAS_ACTIVE_TRADES',
        `진행 중인 주문 ${trades.orders}건 · 판매 경매 ${trades.auctions}건 · 최고 입찰 ${trades.highest}건이 있어 삭제할 수 없습니다. 거래를 마치거나 취소한 뒤 다시 시도해주세요.`,
        trades,
        409,
      );
    const nickname = (await this.prisma.profile.findUnique({ where: { userId: id } }))?.nickname ?? null;
    // 관리자는 잠금 검사와 함께 먼저 일반 회원으로 내린다 (동시 삭제로 최고 관리자가 0명이 되지 않게)
    if (ADMINS.includes(u.role))
      await this.write(ctx, u, (tx) => tx.user.update({ where: { id }, data: { role: 'USER' } }));
    await this.auth.anonymizeAccount(id);
    // 삭제된 회원의 연락처는 감사 로그에도 가려서 남긴다
    await this.audit.log(
      ctx,
      'user.delete',
      'USER',
      id,
      { email: maskEmail(u.email), nickname, role: u.role, status: u.status },
      { status: 'DELETED', reason },
    );
    return { id, deleted: true as const };
  }

  private async assertEmailFree(email: string, exceptId?: string) {
    const other = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (other) {
      const message = '이미 다른 계정이 쓰는 이메일입니다.';
      throw new AppException('ACCOUNT_EXISTS', message, { fields: { email: message } });
    }
  }

  private async assertNicknameFree(nickname: string, exceptId?: string) {
    const other = await this.prisma.profile.findFirst({
      where: { nickname, ...(exceptId ? { userId: { not: exceptId } } : {}) },
      select: { userId: true },
    });
    if (other)
      throw new AppException('NICKNAME_TAKEN', undefined, {
        fields: { nickname: ERROR_MESSAGES.NICKNAME_TAKEN },
      });
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
