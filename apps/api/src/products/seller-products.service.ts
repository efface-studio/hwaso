import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateProductInput, UpdateProductInput } from '@shop/shared';
import { SELLER_ROLES } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { assertClean } from '../common/moderation';
import type { AuthUser } from '../common/auth';
import { logNotifyError, NotificationEvents } from '../notifications/notification-events';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HOME_CACHE_KEY } from './products.service';

/** 업로드한 사용자만 자기 이미지 키를 상품에 붙일 수 있다 (media 업로드 시 기록) */
export const mediaOwnerKey = (key: string) => `media:owner:${key}`;

const ACTIVE_ORDER_STATUSES = [
  'PENDING',
  'PAYMENT_PENDING',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'REFUND_REQUESTED',
] as const;

@Injectable()
export class SellerProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: NotificationEvents,
  ) {}

  private assertSeller(user: AuthUser) {
    if (!SELLER_ROLES.includes(user.role)) throw new AppException('SELLER_REQUIRED');
  }

  private async assertImagesOwned(userId: string, keys: string[], existing: Set<string> = new Set()) {
    for (const key of keys) {
      if (existing.has(key)) continue;
      const owner = await this.redis.get(mediaOwnerKey(key));
      if (owner !== userId)
        throw new AppException('INVALID_IMAGE', '업로드한 이미지만 사용할 수 있습니다. 다시 올려주세요.');
    }
  }

  private async resolveArtist(tx: Tx, artistId?: string | null, artistName?: string | null) {
    if (artistId) {
      const a = await tx.artist.findUnique({ where: { id: artistId }, select: { id: true } });
      if (!a) throw new AppException('VALIDATION_FAILED', '작가 정보를 찾을 수 없습니다.');
      return a.id;
    }
    if (!artistName) return null;
    const found = await tx.artist.findFirst({ where: { name: artistName }, select: { id: true } });
    return (found ?? (await tx.artist.create({ data: { name: artistName } }))).id;
  }

  private async assertCategory(categoryId: string) {
    const c = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { isActive: true, parentId: true },
    });
    if (!c?.isActive) throw new AppException('VALIDATION_FAILED', '카테고리를 다시 선택해주세요.');
  }

  async create(user: AuthUser, input: CreateProductInput) {
    this.assertSeller(user);
    assertClean({ title: input.title, description: input.description });
    await this.assertCategory(input.categoryId);
    await this.assertImagesOwned(
      user.id,
      input.images.map((i) => i.key),
    );
    if (input.certificate?.imageKey) await this.assertImagesOwned(user.id, [input.certificate.imageKey]);

    const imageMeta = await this.imageMeta(input.images.map((i) => i.key));
    const product = await this.prisma.$transaction(async (tx) => {
      const artistId = await this.resolveArtist(tx, input.artistId, input.artistName);
      const publish = input.publish;
      return tx.product.create({
        data: {
          sellerId: user.id,
          categoryId: input.categoryId,
          artistId,
          title: input.title,
          description: input.description,
          maker: input.maker ?? null,
          brand: input.brand ?? null,
          era: input.era ?? null,
          productionYear: input.productionYear ?? null,
          material: input.material ?? null,
          widthCm: input.widthCm ?? null,
          heightCm: input.heightCm ?? null,
          depthCm: input.depthCm ?? null,
          condition: input.condition,
          conditionNote: input.conditionNote ?? null,
          region: input.region ?? null,
          saleType: input.saleType,
          price: input.saleType === 'AUCTION' ? null : BigInt(input.price!),
          listPrice: input.saleType === 'AUCTION' ? null : BigInt(input.price!),
          stock: input.stock,
          shippingFee: BigInt(input.shippingFee),
          shippingMethod: input.shippingMethod,
          returnPolicy: input.returnPolicy,
          availableAt: input.availableAt ? new Date(input.availableAt) : null,
          // 경매 상품은 경매 등록(예약) 시점에 게시된다
          status: publish && input.saleType !== 'AUCTION' ? 'ACTIVE' : 'DRAFT',
          publishedAt: publish && input.saleType !== 'AUCTION' ? new Date() : null,
          verificationStatus: input.certificate ? 'PENDING' : 'UNVERIFIED',
          images: { create: imageMeta },
          certificate: input.certificate
            ? {
                create: {
                  issuer: input.certificate.issuer,
                  number: input.certificate.number,
                  issuedAt: input.certificate.issuedAt ? new Date(input.certificate.issuedAt) : null,
                  imageKey: input.certificate.imageKey ?? null,
                  authenticityNote: input.certificate.authenticityNote,
                  verificationStatus: 'PENDING',
                },
              }
            : undefined,
          provenance: { create: input.provenance.map((p, i) => ({ ...p, sortOrder: i })) },
        },
        select: { id: true, status: true },
      });
    });
    if (product.status === 'ACTIVE') void this.events.newProduct(product.id).catch(logNotifyError);
    return product;
  }

  /** 이미지 크기·대표색은 업로드 시 Redis 에 남긴 값을 쓰고, 없으면 기존 이미지 행에서 가져온다 */
  private async imageMeta(keys: string[]) {
    return Promise.all(
      keys.map(async (key, sortOrder) => {
        const raw = await this.redis.get(`media:meta:${key}`);
        const prev = raw
          ? (JSON.parse(raw) as { width: number; height: number; dominantColor: string })
          : await this.prisma.productImage.findFirst({
              where: { key },
              select: { width: true, height: true, dominantColor: true },
            });
        if (!prev)
          throw new AppException('INVALID_IMAGE', '이미지 정보를 찾을 수 없습니다. 다시 올려주세요.');
        return { key, width: prev.width, height: prev.height, dominantColor: prev.dominantColor, sortOrder };
      }),
    );
  }

  private async owned(user: AuthUser, id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        auction: { select: { status: true } },
        images: { select: { key: true } },
        certificate: true,
      },
    });
    // 남의 상품이면 존재 여부도 알리지 않는다 (IDOR)
    if (!p || (p.sellerId !== user.id && !['ADMIN', 'SUPER_ADMIN'].includes(user.role))) {
      throw new AppException('NOT_FOUND', '상품을 찾을 수 없습니다.');
    }
    return p;
  }

  async update(user: AuthUser, id: string, input: UpdateProductInput) {
    assertClean({ title: input.title, description: input.description });
    const p = await this.owned(user, id);
    const auctionLocked = p.auction && ['LIVE', 'ENDED', 'SETTLED'].includes(p.auction.status);
    const priceTouched = input.price !== undefined || input.saleType !== undefined;
    if (p.status === 'SOLD')
      throw new AppException('PRODUCT_NOT_EDITABLE', '판매 완료된 상품은 수정할 수 없습니다.');
    if (auctionLocked && (priceTouched || input.images)) {
      throw new AppException(
        'PRODUCT_NOT_EDITABLE',
        '경매가 시작된 후에는 가격·판매 방식·사진을 바꿀 수 없습니다.',
      );
    }
    if (input.saleType && input.saleType !== p.saleType && p.auction) {
      throw new AppException(
        'PRODUCT_NOT_EDITABLE',
        '경매가 등록된 상품은 판매 방식을 바꿀 수 없습니다. 경매를 취소한 뒤 다시 시도해주세요.',
      );
    }
    if (input.categoryId) await this.assertCategory(input.categoryId);
    if (input.images) {
      await this.assertImagesOwned(
        user.id,
        input.images.map((i) => i.key),
        new Set(p.images.map((i) => i.key)),
      );
    }
    const saleType = input.saleType ?? p.saleType;
    const nextPrice = input.price !== undefined ? input.price : p.price == null ? null : Number(p.price);
    if (saleType !== 'AUCTION' && !nextPrice) {
      throw new AppException('VALIDATION_FAILED', '판매 가격을 입력해주세요.', {
        fields: { price: '판매 가격을 입력해주세요.' },
      });
    }
    const imageMeta = input.images ? await this.imageMeta(input.images.map((i) => i.key)) : null;

    const oldPrice = p.price;
    await this.prisma.$transaction(async (tx) => {
      const artistId =
        input.artistId !== undefined || input.artistName !== undefined
          ? await this.resolveArtist(tx, input.artistId, input.artistName)
          : undefined;
      const data: Prisma.ProductUpdateInput = {
        title: input.title,
        description: input.description,
        category: input.categoryId ? { connect: { id: input.categoryId } } : undefined,
        artist:
          artistId === undefined
            ? undefined
            : artistId
              ? { connect: { id: artistId } }
              : { disconnect: true },
        maker: input.maker,
        brand: input.brand,
        era: input.era,
        productionYear: input.productionYear,
        material: input.material,
        widthCm: input.widthCm,
        heightCm: input.heightCm,
        depthCm: input.depthCm,
        condition: input.condition,
        conditionNote: input.conditionNote,
        region: input.region,
        saleType: input.saleType,
        price: saleType === 'AUCTION' ? null : BigInt(nextPrice!),
        listPrice: saleType === 'AUCTION' ? undefined : BigInt(nextPrice!),
        stock: input.stock,
        shippingFee: input.shippingFee === undefined ? undefined : BigInt(input.shippingFee),
        shippingMethod: input.shippingMethod,
        returnPolicy: input.returnPolicy,
        availableAt:
          input.availableAt === undefined
            ? undefined
            : input.availableAt
              ? new Date(input.availableAt)
              : null,
      };
      await tx.product.update({ where: { id }, data });
      if (imageMeta) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({ data: imageMeta.map((m) => ({ ...m, productId: id })) });
      }
      if (input.certificate !== undefined) {
        await tx.certificate.deleteMany({ where: { productId: id } });
        if (input.certificate) {
          // 인증서 내용이 바뀌면 다시 검수 대기
          await tx.certificate.create({
            data: {
              productId: id,
              issuer: input.certificate.issuer,
              number: input.certificate.number,
              issuedAt: input.certificate.issuedAt ? new Date(input.certificate.issuedAt) : null,
              imageKey: input.certificate.imageKey ?? null,
              authenticityNote: input.certificate.authenticityNote,
              verificationStatus: 'PENDING',
            },
          });
        }
        await tx.product.update({
          where: { id },
          data: { verificationStatus: input.certificate ? 'PENDING' : 'UNVERIFIED' },
        });
      }
      if (input.provenance) {
        await tx.provenance.deleteMany({ where: { productId: id } });
        await tx.provenance.createMany({
          data: input.provenance.map((v, i) => ({ ...v, productId: id, sortOrder: i })),
        });
      }
    });
    await this.redis.del(HOME_CACHE_KEY);
    const priceChanged = oldPrice != null && nextPrice != null && Number(oldPrice) !== nextPrice;
    if (priceChanged) void this.events.priceDropped(id, Number(oldPrice), nextPrice).catch(logNotifyError);
    return { id, priceChanged };
  }

  async publish(user: AuthUser, id: string) {
    const p = await this.owned(user, id);
    if (p.saleType === 'AUCTION') {
      throw new AppException(
        'INVALID_TRANSITION',
        '경매 상품은 경매 등록 화면에서 일정을 정하면 게시됩니다.',
      );
    }
    if (p.status !== 'DRAFT') throw new AppException('INVALID_TRANSITION');
    await this.prisma.product.update({
      where: { id },
      data: { status: 'ACTIVE', publishedAt: p.publishedAt ?? new Date() },
    });
    await this.redis.del(HOME_CACHE_KEY);
    if (!p.publishedAt) void this.events.newProduct(id).catch(logNotifyError);
  }

  /** 판매 중지 ↔ 재개 (연결 기능) */
  async pause(user: AuthUser, id: string) {
    const p = await this.owned(user, id);
    if (p.auction && ['SCHEDULED', 'LIVE'].includes(p.auction.status)) {
      throw new AppException(
        'PRODUCT_IN_USE',
        '예정·진행 중인 경매가 있어 판매를 중지할 수 없습니다. 경매를 먼저 취소해주세요.',
      );
    }
    const updated = await this.prisma.product.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'HIDDEN' },
    });
    if (!updated.count) throw new AppException('INVALID_TRANSITION');
    await this.redis.del(HOME_CACHE_KEY);
  }

  async resume(user: AuthUser, id: string) {
    await this.owned(user, id);
    const updated = await this.prisma.product.updateMany({
      where: { id, status: 'HIDDEN' },
      data: { status: 'ACTIVE' },
    });
    if (!updated.count) throw new AppException('INVALID_TRANSITION');
    await this.redis.del(HOME_CACHE_KEY);
  }

  async remove(user: AuthUser, id: string) {
    const p = await this.owned(user, id);
    if (p.auction && ['SCHEDULED', 'LIVE', 'ENDED'].includes(p.auction.status)) {
      throw new AppException('PRODUCT_IN_USE');
    }
    const activeOrders = await this.prisma.orderItem.count({
      where: { productId: id, order: { status: { in: [...ACTIVE_ORDER_STATUSES] } } },
    });
    if (activeOrders) throw new AppException('PRODUCT_IN_USE');
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: 'HIDDEN' } }),
      this.prisma.cartItem.deleteMany({ where: { productId: id } }),
    ]);
    await this.redis.del(HOME_CACHE_KEY);
  }

  /** 판매자 본인의 상품 목록 (모든 상태) */
  async mine(user: AuthUser, status?: string) {
    const where: Prisma.ProductWhereInput = { sellerId: user.id, deletedAt: null };
    if (status === 'selling') where.status = { in: ['ACTIVE', 'RESERVED'] };
    else if (status === 'draft') where.status = 'DRAFT';
    else if (status === 'hidden') where.status = { in: ['HIDDEN', 'SUSPENDED', 'PENDING_REVIEW'] };
    else if (status === 'sold') where.status = 'SOLD';
    return this.prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        status: true,
        saleType: true,
        price: true,
        listPrice: true,
        viewCount: true,
        favoriteCount: true,
        verificationStatus: true,
        updatedAt: true,
        images: {
          take: 1,
          orderBy: { sortOrder: 'asc' },
          select: { key: true, width: true, height: true, dominantColor: true },
        },
        auction: {
          select: {
            id: true,
            status: true,
            currentPrice: true,
            bidCount: true,
            endsAt: true,
            startsAt: true,
          },
        },
        _count: { select: { inquiries: { where: { answer: null } } } },
      },
    });
  }

  /** 판매자 대시보드 요약 */
  async stats(user: AuthUser) {
    const base = { sellerId: user.id, deletedAt: null };
    const [byStatus, agg, liveAuctions, scheduledAuctions, unanswered, pendingOrders] = await Promise.all([
      this.prisma.product.groupBy({ by: ['status'], where: base, _count: true }),
      this.prisma.product.aggregate({ where: base, _sum: { viewCount: true, favoriteCount: true } }),
      this.prisma.auction.count({ where: { sellerId: user.id, status: 'LIVE' } }),
      this.prisma.auction.count({ where: { sellerId: user.id, status: 'SCHEDULED' } }),
      this.prisma.inquiry.count({ where: { answer: null, product: base } }),
      this.prisma.order.count({ where: { sellerId: user.id, status: { in: ['PAID', 'PREPARING'] } } }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
    return {
      selling: count('ACTIVE') + count('RESERVED'),
      draft: count('DRAFT'),
      hidden: count('HIDDEN') + count('SUSPENDED') + count('PENDING_REVIEW'),
      sold: count('SOLD'),
      views: agg._sum.viewCount ?? 0,
      favorites: agg._sum.favoriteCount ?? 0,
      liveAuctions,
      scheduledAuctions,
      unansweredInquiries: unanswered,
      ordersToShip: pendingOrders,
    };
  }
}
