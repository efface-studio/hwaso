import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AdminAuctionRow,
  AdminCategoryRow,
  AdminProductRow,
  AdminProductsQuery,
  AuctionPolicyInput,
  CategoryInput,
  Paged,
  PageQuery,
} from '@shop/shared';
import { invalidateAuctionPolicy } from '../auctions/auction-policy';
import { CATEGORY_CACHE_KEY } from '../catalog/catalog.controller';
import { AppException } from '../common/app-exception';
import { logNotifyError } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';
import { toUserSummary } from '../orders/order.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { invalidateCatalog } from '../products/catalog-cache';
import { RedisService } from '../redis/redis.service';
import { AuditService, type AuditContext } from './audit.service';

const userSel = { id: true, profile: { select: { nickname: true, avatarKey: true } } } as const;

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───── 작품 ─────

  async products(q: AdminProductsQuery): Promise<Paged<AdminProductRow>> {
    const where: Prisma.ProductWhereInput = {
      ...(q.q ? { OR: [{ id: q.q }, { title: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.verification ? { verificationStatus: q.verification } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          images: {
            select: { key: true, width: true, height: true, dominantColor: true },
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
          seller: { select: userSel },
          certificate: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.prisma.product.count({ where }),
    ]);
    const reports = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: {
        targetType: 'PRODUCT',
        targetId: { in: rows.map((r) => r.id) },
        status: { in: ['OPEN', 'IN_REVIEW'] },
      },
      _count: true,
    });
    return {
      items: rows.map((p) => ({
        id: p.id,
        title: p.title,
        image: p.images[0] ?? null,
        seller: toUserSummary(p.seller),
        saleType: p.saleType,
        status: p.status,
        price: p.price == null ? null : Number(p.price),
        verificationStatus: p.verificationStatus,
        certificate: p.certificate && {
          issuer: p.certificate.issuer,
          number: p.certificate.number,
          imageKey: p.certificate.imageKey,
          reviewNote: p.certificate.reviewNote,
        },
        reportCount: reports.find((r) => r.targetId === p.id)?._count ?? 0,
        createdAt: p.createdAt.toISOString(),
        deletedAt: p.deletedAt?.toISOString() ?? null,
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }

  /** 운영 정지(SUSPENDED) ↔ 복구. 진행 중 주문이 있는 작품은 막지 않되 기록을 남긴다 */
  async moderateProduct(ctx: AuditContext, id: string, action: 'hide' | 'restore', reason: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      select: { status: true, sellerId: true, title: true },
    });
    if (!p) throw new AppException('NOT_FOUND');
    if (action === 'hide' && p.status === 'SUSPENDED') throw new AppException('INVALID_TRANSITION');
    if (action === 'restore' && p.status !== 'SUSPENDED') throw new AppException('INVALID_TRANSITION');
    const status = action === 'hide' ? 'SUSPENDED' : 'HIDDEN';
    await this.prisma.product.update({ where: { id }, data: { status } });
    await invalidateCatalog(this.redis);
    await this.audit.log(ctx, `product.${action}`, 'PRODUCT', id, { status: p.status }, { status, reason });
    void this.notifications
      .notify(p.sellerId, {
        type: 'SYSTEM',
        title: action === 'hide' ? '작품이 운영 정책에 따라 비공개되었어요' : '작품 비공개가 해제되었어요',
        body: `${p.title} · ${reason}`,
        link: `/sell/${id}/edit`,
      })
      .catch(logNotifyError);
    return { id, status };
  }

  /** 인증서 검수: 원본 대조 결과를 작품 표시(플랫폼 검수 완료/반려)에 반영 */
  async reviewCertificate(
    ctx: AuditContext,
    productId: string,
    status: 'VERIFIED' | 'REJECTED',
    note: string,
  ) {
    const c = await this.prisma.certificate.findUnique({ where: { productId }, include: { product: true } });
    if (!c) throw new AppException('NOT_FOUND', '인증서가 등록되지 않은 작품입니다.');
    await this.prisma.$transaction([
      this.prisma.certificate.update({
        where: { productId },
        data: {
          verificationStatus: status,
          reviewedById: ctx.user.id,
          reviewedAt: new Date(),
          reviewNote: note || null,
        },
      }),
      this.prisma.product.update({ where: { id: productId }, data: { verificationStatus: status } }),
    ]);
    await this.audit.log(
      ctx,
      'certificate.review',
      'PRODUCT',
      productId,
      { status: c.verificationStatus },
      { status, note },
    );
    void this.notifications
      .notify(c.product.sellerId, {
        type: 'SYSTEM',
        title: status === 'VERIFIED' ? '인증서 검수가 완료되었어요' : '인증서 검수가 반려되었어요',
        body:
          status === 'VERIFIED'
            ? `${c.product.title} · 플랫폼 검수 완료 표시가 붙어요.`
            : `${c.product.title} · ${note}`,
        link: `/products/${productId}`,
      })
      .catch(logNotifyError);
    return { productId, status };
  }

  async deleteProduct(ctx: AuditContext, id: string, reason: string) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p || p.deletedAt) throw new AppException('NOT_FOUND');
    const active = await this.prisma.order.count({
      where: {
        items: { some: { productId: id } },
        status: { in: ['PAYMENT_PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'REFUND_REQUESTED'] },
      },
    });
    if (active) throw new AppException('PRODUCT_IN_USE');
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: 'HIDDEN' } });
    await invalidateCatalog(this.redis);
    await this.audit.log(
      ctx,
      'product.delete',
      'PRODUCT',
      id,
      { status: p.status },
      { deleted: true, reason },
    );
    return { ok: true };
  }

  // ───── 카테고리 ─────

  async categories(): Promise<AdminCategoryRow[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      group: c.group,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: c._count.products,
    }));
  }

  private async assertParent(parentId: string | null, selfId?: string) {
    if (!parentId) return;
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent || parent.parentId)
      throw new AppException('VALIDATION_FAILED', '상위 카테고리는 1단계 카테고리만 고를 수 있어요.');
    if (parent.id === selfId) throw new AppException('VALIDATION_FAILED', '자기 자신을 상위로 둘 수 없어요.');
  }

  async createCategory(ctx: AuditContext, input: CategoryInput) {
    await this.assertParent(input.parentId);
    if (await this.prisma.category.count({ where: { slug: input.slug } }))
      throw new AppException('CONFLICT', '이미 쓰는 주소(slug)입니다.');
    const c = await this.prisma.category.create({ data: input });
    await this.redis.del(CATEGORY_CACHE_KEY);
    await this.audit.log(ctx, 'category.create', 'CATEGORY', c.id, null, input);
    return c;
  }

  async updateCategory(ctx: AuditContext, id: string, input: CategoryInput) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new AppException('NOT_FOUND');
    await this.assertParent(input.parentId, id);
    if (input.slug !== before.slug && (await this.prisma.category.count({ where: { slug: input.slug } })))
      throw new AppException('CONFLICT', '이미 쓰는 주소(slug)입니다.');
    const c = await this.prisma.category.update({ where: { id }, data: input });
    await this.redis.del(CATEGORY_CACHE_KEY);
    await this.audit.log(ctx, 'category.update', 'CATEGORY', id, before, input);
    return c;
  }

  /** 작품이 있거나 하위 카테고리가 있으면 삭제 대신 비활성화를 안내한다 */
  async deleteCategory(ctx: AuditContext, id: string) {
    const c = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!c) throw new AppException('NOT_FOUND');
    if (c._count.products || c._count.children)
      throw new AppException(
        'CONFLICT',
        '작품이나 하위 카테고리가 있어 삭제할 수 없어요. 숨김 처리해주세요.',
      );
    await this.prisma.category.delete({ where: { id } });
    await this.redis.del(CATEGORY_CACHE_KEY);
    await this.audit.log(ctx, 'category.delete', 'CATEGORY', id, c, null);
    return { ok: true };
  }

  // ───── 경매 ─────

  async auctions(q: PageQuery & { status?: string }): Promise<Paged<AdminAuctionRow>> {
    const where: Prisma.AuctionWhereInput = {
      ...(q.q ? { OR: [{ id: q.q }, { product: { title: { contains: q.q, mode: 'insensitive' } } }] } : {}),
      ...(q.status ? { status: q.status as Prisma.EnumAuctionStatusFilter['equals'] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        include: { product: { select: { title: true } }, seller: { select: userSel } },
        orderBy: { endsAt: 'desc' },
        skip: (q.page - 1) * q.size,
        take: q.size,
      }),
      this.prisma.auction.count({ where }),
    ]);
    return {
      items: rows.map((a) => ({
        id: a.id,
        productId: a.productId,
        title: a.product.title,
        seller: toUserSummary(a.seller),
        status: a.status,
        result: a.result,
        currentPrice: Number(a.currentPrice),
        bidCount: a.bidCount,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
      })),
      total,
      page: q.page,
      size: q.size,
    };
  }

  async policy() {
    return this.prisma.auctionPolicy.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async setPolicy(ctx: AuditContext, input: AuctionPolicyInput) {
    const before = await this.policy();
    const after = await this.prisma.auctionPolicy.update({ where: { id: 'default' }, data: input });
    invalidateAuctionPolicy();
    await this.audit.log(ctx, 'auction.policy', 'AUCTION_POLICY', 'default', before, input);
    return after;
  }
}
