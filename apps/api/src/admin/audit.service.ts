import { Injectable } from '@nestjs/common';
import type { AuditLogRow, Paged } from '@shop/shared';
import type { AuthUser } from '../common/auth';
import { toUserSummary } from '../orders/order.mapper';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditContext {
  user: AuthUser;
  ip: string | null;
}

/** 관리자 변경 기록. 모든 관리자 쓰기 작업은 before/after 와 함께 남긴다 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    ctx: AuditContext,
    action: string,
    targetType: string,
    targetId: string,
    before?: unknown,
    after?: unknown,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action,
        targetType,
        targetId,
        before: (before ?? undefined) as object | undefined,
        after: (after ?? undefined) as object | undefined,
        ip: ctx.ip,
      },
    });
  }

  async list(q: {
    page: number;
    size: number;
    targetType?: string;
    actorId?: string;
    q?: string;
  }): Promise<Paged<AuditLogRow>> {
    const where = {
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.q ? { OR: [{ targetId: q.q }, { action: { contains: q.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))] } },
      select: { id: true, profile: { select: { nickname: true, avatarKey: true } } },
    });
    const byId = new Map(actors.map((a) => [a.id, toUserSummary(a)]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        actor: r.actorId ? (byId.get(r.actorId) ?? null) : null,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        before: r.before,
        after: r.after,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }
}
