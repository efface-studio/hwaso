import { Injectable } from '@nestjs/common';
import type { Address } from '@prisma/client';
import type { AddressDto, AddressInput, CartItemDto, ShippingAddress } from '@shop/shared';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { cardSelect, PUBLIC_PRODUCT, toCard } from '../products/product.mapper';
import { toUserSummary } from './order.mapper';

const ADDRESS_LIMIT = 20;
const CART_LIMIT = 100;

export const toAddress = (a: Address): AddressDto => ({
  id: a.id,
  recipient: a.recipient,
  phone: a.phone,
  zipCode: a.zipCode,
  address1: a.address1,
  address2: a.address2,
  memo: a.memo,
  isDefault: a.isDefault,
});

export const addressSnapshot = (a: Address): ShippingAddress => {
  const { id: _id, isDefault: _d, ...rest } = toAddress(a);
  return rest;
};

/** 배송지 주소록 + 장바구니 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  // ───── 배송지: 추가 ↔ 수정 ↔ 삭제 ↔ 기본 배송지 ─────

  async addresses(userId: string): Promise<AddressDto[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toAddress);
  }

  async createAddress(userId: string, input: AddressInput): Promise<AddressDto> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= ADDRESS_LIMIT) throw new AppException('ADDRESS_LIMIT');
      // 첫 배송지는 자동으로 기본 배송지
      const isDefault = input.isDefault || count === 0;
      if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return toAddress(await tx.address.create({ data: { ...input, isDefault, userId } }));
    });
  }

  async updateAddress(userId: string, id: string, input: Partial<AddressInput>): Promise<AddressDto> {
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.address.findFirst({ where: { id, userId } });
      if (!a) throw new AppException('NOT_FOUND');
      if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      // 기본 배송지를 해제만 하는 요청은 무시 (기본 배송지는 항상 하나)
      const isDefault = input.isDefault || a.isDefault;
      return toAddress(await tx.address.update({ where: { id }, data: { ...input, isDefault } }));
    });
  }

  async deleteAddress(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.address.findFirst({ where: { id, userId } });
      if (!a) throw new AppException('NOT_FOUND');
      await tx.address.delete({ where: { id } });
      if (a.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return { ok: true };
  }

  // ───── 장바구니: 담기(수량) ↔ 빼기 ↔ 비우기 ─────

  async cart(userId: string): Promise<CartItemDto[]> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            ...cardSelect,
            stock: true,
            shippingFee: true,
            deletedAt: true,
            sellerId: true,
            seller: { select: { id: true, profile: { select: { nickname: true, avatarKey: true } } } },
          },
        },
      },
    });
    const favs = new Set(
      (
        await this.prisma.favorite.findMany({
          where: { userId, productId: { in: rows.map((r) => r.productId) } },
          select: { productId: true },
        })
      ).map((f) => f.productId),
    );
    return rows.map((r) => {
      const p = r.product;
      return {
        productId: r.productId,
        quantity: r.quantity,
        addedAt: r.createdAt.toISOString(),
        product: { ...toCard(p, favs), stock: p.stock, shippingFee: Number(p.shippingFee) },
        seller: toUserSummary(p.seller),
        available:
          !p.deletedAt &&
          p.status === 'ACTIVE' &&
          p.saleType !== 'AUCTION' &&
          p.stock >= r.quantity &&
          p.sellerId !== userId,
      };
    });
  }

  async put(userId: string, productId: string, quantity: number) {
    const p = await this.prisma.product.findFirst({ where: { id: productId, ...PUBLIC_PRODUCT } });
    if (!p) throw new AppException('NOT_FOUND');
    if (p.saleType === 'AUCTION')
      throw new AppException('NOT_FOR_SALE', '경매 상품은 장바구니에 담을 수 없습니다.');
    if (p.sellerId === userId) throw new AppException('SELF_PURCHASE', undefined, undefined, 403);
    if (p.stock < quantity) throw new AppException('OUT_OF_STOCK', undefined, { stock: p.stock });
    const exists = await this.prisma.cartItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!exists && (await this.prisma.cartItem.count({ where: { userId } })) >= CART_LIMIT)
      throw new AppException('VALIDATION_FAILED', `장바구니에는 최대 ${CART_LIMIT}개까지 담을 수 있습니다.`);
    await this.prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, quantity },
      update: { quantity },
    });
    return { ok: true, count: await this.prisma.cartItem.count({ where: { userId } }) };
  }

  async remove(userId: string, productIds: string[] | 'all') {
    await this.prisma.cartItem.deleteMany({
      where: { userId, ...(productIds === 'all' ? {} : { productId: { in: productIds } }) },
    });
    return { ok: true, count: await this.prisma.cartItem.count({ where: { userId } }) };
  }
}
