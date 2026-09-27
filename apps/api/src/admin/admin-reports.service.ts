import { Injectable } from '@nestjs/common';
import type { Prisma, Report, ReportStatus, ReportTarget } from '@prisma/client';
import type { AdminReportRow, Paged, PageQuery, ReportAction, UserSummary } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { toUserSummary } from '../orders/order.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminUsersService } from './admin-users.service';
import { AuditService, type AuditContext } from './audit.service';

const userSel = { id: true, profile: { select: { nickname: true, avatarKey: true } } } as const;

/** 신고 처리: 대상 미리보기, 같은 대상 누적 수, 처리와 연계 조치(작품 비공개·회원 정지·메시지/후기 삭제) */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: AdminUsersService,
    private readonly catalog: AdminCatalogService,
  ) {}

  private async target(r: Report): Promise<{ preview: string; owner: UserSummary | null }> {
    const id = r.targetId;
    switch (r.targetType) {
      case 'PRODUCT': {
        const p = await this.prisma.product.findUnique({
          where: { id },
          select: { title: true, seller: { select: userSel } },
        });
        return { preview: p?.title ?? '(삭제된 작품)', owner: p ? toUserSummary(p.seller) : null };
      }
      case 'USER': {
        const u = await this.prisma.user.findUnique({ where: { id }, select: userSel });
        return { preview: u?.profile?.nickname ?? '(탈퇴 회원)', owner: u ? toUserSummary(u) : null };
      }
      case 'REVIEW': {
        const v = await this.prisma.review.findUnique({
          where: { id },
          select: { comment: true, author: { select: userSel } },
        });
        return {
          preview: v?.comment.slice(0, 120) ?? '(삭제된 후기)',
          owner: v ? toUserSummary(v.author) : null,
        };
      }
      case 'MESSAGE': {
        const m = await this.prisma.chatMessage.findUnique({
          where: { id },
          select: { body: true, kind: true, sender: { select: userSel } },
        });
        return {
          preview: m ? (m.body ?? `(${m.kind})`).slice(0, 120) : '(삭제된 메시지)',
          owner: m ? toUserSummary(m.sender) : null,
        };
      }
    }
  }

  async list(
    q: PageQuery & { status?: ReportStatus; targetType?: ReportTarget },
  ): Promise<Paged<AdminReportRow>> {
    const where: Prisma.ReportWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.q ? { OR: [{ targetId: q.q }, { detail: { contains: q.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { reporter: { select: userSel } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.prisma.report.count({ where }),
    ]);
    const counts = await this.prisma.report.groupBy({
      by: ['targetType', 'targetId'],
      where: { targetId: { in: rows.map((r) => r.targetId) } },
      _count: true,
    });
    const items = await Promise.all(
      rows.map(async (r) => {
        const t = await this.target(r);
        return {
          id: r.id,
          reporter: toUserSummary(r.reporter),
          targetType: r.targetType,
          targetId: r.targetId,
          targetPreview: t.preview,
          targetOwner: t.owner,
          reason: r.reason,
          detail: r.detail,
          status: r.status,
          resolution: r.resolution,
          sameTargetCount:
            counts.find((c) => c.targetId === r.targetId && c.targetType === r.targetType)?._count ?? 1,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    );
    return { items, total, page: q.page, size: q.size };
  }

  async resolve(
    ctx: AuditContext,
    id: string,
    input: { status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'; resolution: string; action: ReportAction },
  ) {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw new AppException('NOT_FOUND');
    const reason = input.resolution || '신고 처리';
    if (input.action !== 'none' && input.status !== 'RESOLVED')
      throw new AppException('VALIDATION_FAILED', '조치는 처리 완료와 함께만 할 수 있어요.');
    switch (input.action) {
      case 'hide_product':
        if (r.targetType !== 'PRODUCT')
          throw new AppException('VALIDATION_FAILED', '작품 신고에만 쓸 수 있어요.');
        await this.catalog.moderateProduct(ctx, r.targetId, 'hide', reason);
        break;
      case 'suspend_user': {
        const owner = (await this.target(r)).owner;
        if (!owner) throw new AppException('NOT_FOUND');
        await this.users.suspend(ctx, owner.id, reason);
        break;
      }
      case 'delete_message':
        if (r.targetType !== 'MESSAGE')
          throw new AppException('VALIDATION_FAILED', '메시지 신고에만 쓸 수 있어요.');
        await this.prisma.chatMessage.update({ where: { id: r.targetId }, data: { deletedAt: new Date() } });
        await this.audit.log(ctx, 'message.delete', 'MESSAGE', r.targetId, null, { reason });
        break;
      case 'delete_review': {
        if (r.targetType !== 'REVIEW')
          throw new AppException('VALIDATION_FAILED', '후기 신고에만 쓸 수 있어요.');
        const v = await this.prisma.review.update({
          where: { id: r.targetId },
          data: { deletedAt: new Date() },
        });
        const agg = await this.prisma.review.aggregate({
          where: { targetUserId: v.targetUserId, deletedAt: null },
          _avg: { rating: true },
          _count: true,
        });
        await this.prisma.profile.updateMany({
          where: { userId: v.targetUserId },
          data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
        });
        await this.audit.log(ctx, 'review.delete', 'REVIEW', r.targetId, null, { reason });
        break;
      }
    }
    // 같은 대상의 열린 신고는 함께 처리한다
    const closing = input.status !== 'IN_REVIEW';
    await this.prisma.report.updateMany({
      where: closing
        ? { targetType: r.targetType, targetId: r.targetId, status: { in: ['OPEN', 'IN_REVIEW'] } }
        : { id },
      data: { status: input.status, resolution: input.resolution || null, handledById: ctx.user.id },
    });
    await this.audit.log(ctx, 'report.resolve', 'REPORT', id, { status: r.status }, input);
    return { ok: true };
  }
}
