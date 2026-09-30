import {
  Body,
  Controller,
  Delete,
  Get,
  Global,
  HttpCode,
  Injectable,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { createReportSchema, type CreateReportInput } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { CurrentUser, type AuthUser } from '../common/auth';
import { RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { isUniqueViolation } from '../orders/order-state';
import { PrismaService } from '../prisma/prisma.service';

/** 차단 · 신고. 차단은 채팅·문의 등 사용자 간 상호작용 전체에 적용된다 */
@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  /** 둘 중 한쪽이라도 차단했으면 true */
  async blockedBetween(a: string, b: string) {
    return (
      (await this.prisma.userBlock.count({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
      })) > 0
    );
  }

  /** 내가 차단한 사용자 id — 목록·상세·후기·문의에서 그 사람의 콘텐츠를 뺀다 (로그인한 경우만) */
  async blockedIds(viewerId: string | undefined): Promise<string[]> {
    if (!viewerId) return [];
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: viewerId },
      select: { blockedId: true },
    });
    return rows.map((r) => r.blockedId);
  }

  /** 목록 where 에 붙일 조건 (차단한 사람이 없으면 빈 조건) */
  async excludeBlocked<K extends string>(viewerId: string | undefined, field: K) {
    const ids = await this.blockedIds(viewerId);
    return (ids.length ? { [field]: { notIn: ids } } : {}) as Partial<Record<K, { notIn: string[] }>>;
  }

  async block(userId: string, targetId: string) {
    if (userId === targetId) throw new AppException('VALIDATION_FAILED', '본인은 차단할 수 없습니다.');
    const target = await this.prisma.user.count({ where: { id: targetId, status: { not: 'DELETED' } } });
    if (!target) throw new AppException('NOT_FOUND');
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    });
    return { ok: true };
  }

  async unblock(userId: string, targetId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    return { ok: true };
  }

  async blocks(userId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: { select: { id: true, profile: { select: { nickname: true, avatarKey: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.blocked.id,
      nickname: r.blocked.profile?.nickname ?? '탈퇴한 회원',
      avatarKey: r.blocked.profile?.avatarKey ?? null,
      blockedAt: r.createdAt.toISOString(),
    }));
  }

  private async targetOwner(input: CreateReportInput): Promise<string | null> {
    const id = input.targetId;
    switch (input.targetType) {
      case 'USER':
        return (await this.prisma.user.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
      case 'PRODUCT':
        return (
          (await this.prisma.product.findUnique({ where: { id }, select: { sellerId: true } }))?.sellerId ??
          null
        );
      case 'REVIEW':
        return (
          (await this.prisma.review.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ??
          null
        );
      case 'MESSAGE':
        return (
          (await this.prisma.chatMessage.findUnique({ where: { id }, select: { senderId: true } }))
            ?.senderId ?? null
        );
    }
  }

  async report(userId: string, input: CreateReportInput) {
    const owner = await this.targetOwner(input);
    if (!owner) throw new AppException('NOT_FOUND');
    if (owner === userId) throw new AppException('VALIDATION_FAILED', '본인 콘텐츠는 신고할 수 없습니다.');
    try {
      const r = await this.prisma.report.create({ data: { ...input, reporterId: userId } });
      return { id: r.id };
    } catch (e) {
      if (isUniqueViolation(e))
        throw new AppException('CONFLICT', '이미 신고했어요. 운영팀이 확인하고 있습니다.');
      throw e;
    }
  }

  async myReports(userId: string) {
    const rows = await this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      resolution: r.resolution,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('users/:id/block')
  @HttpCode(200)
  block(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.safety.block(u.id, id);
  }

  @Delete('users/:id/block')
  unblock(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.safety.unblock(u.id, id);
  }

  @Get('me/blocks')
  blocks(@CurrentUser() u: AuthUser) {
    return this.safety.blocks(u.id);
  }

  @Post('reports')
  @RateLimit({ name: 'report', limit: 20, windowSec: 3600, by: 'user' })
  report(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createReportSchema)) body: CreateReportInput) {
    return this.safety.report(u.id, body);
  }

  @Get('me/reports')
  myReports(@CurrentUser() u: AuthUser) {
    return this.safety.myReports(u.id);
  }
}

@Global()
@Module({ controllers: [SafetyController], providers: [SafetyService], exports: [SafetyService] })
export class SafetyModule {}
