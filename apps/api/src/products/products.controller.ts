import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  createProductSchema,
  inquiryAnswerSchema,
  inquirySchema,
  productListQuery,
  updateProductSchema,
  type CreateProductInput,
  type ProductListQuery,
  type UpdateProductInput,
} from '@shop/shared';
import { z } from 'zod';
import { AppException } from '../common/app-exception';
import { CurrentUser, OptionalAuth, Public, type AuthedRequest, type AuthUser } from '../common/auth';
import { clientIp, RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { cardInclude, PUBLIC_PRODUCT, toCard } from './product.mapper';
import { ProductsService } from './products.service';
import { SellerProductsService } from './seller-products.service';

const suggestQuery = z.object({ q: z.string().max(50).default('') });
const facetsQuery = z.object({ category: z.string().max(60).optional() });
const mineQuery = z.object({ status: z.enum(['all', 'selling', 'draft', 'hidden', 'sold']).default('all') });

@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly seller: SellerProductsService,
    private readonly prisma: PrismaService,
  ) {}

  @OptionalAuth()
  @Get('home')
  home(@CurrentUser() user?: AuthUser) {
    return this.products.home(user);
  }

  @OptionalAuth()
  @Get('products')
  list(@Query(new ZodPipe(productListQuery)) q: ProductListQuery, @CurrentUser() user?: AuthUser) {
    return this.products.list(q, user);
  }

  @Public()
  @Get('products/suggest')
  suggest(@Query(new ZodPipe(suggestQuery)) q: { q: string }) {
    return this.products.suggest(q.q);
  }

  @Public()
  @Get('products/facets')
  facets(@Query(new ZodPipe(facetsQuery)) q: { category?: string }) {
    return this.products.facets(q.category);
  }

  @OptionalAuth()
  @Get('products/:id')
  detail(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.products.detail(id, user);
  }

  @OptionalAuth()
  @Get('products/:id/related')
  related(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.products.related(id, user);
  }

  @OptionalAuth()
  @Post('products/:id/view')
  @HttpCode(204)
  @RateLimit({ name: 'view', limit: 120, windowSec: 60, by: 'ip' })
  async view(@Param('id') id: string, @Req() req: AuthedRequest) {
    await this.products.recordView(id, req.user ? `u:${req.user.id}` : `ip:${clientIp(req)}`, req.user?.id);
  }

  // ───── 판매자 상품 관리 (생성 ↔ 수정 ↔ 게시·중지·재개 ↔ 삭제) ─────

  @Post('products')
  @RateLimit({ name: 'product-create', limit: 30, windowSec: 3600, by: 'user' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createProductSchema)) body: CreateProductInput) {
    return this.seller.create(user, body);
  }

  @Patch('products/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateProductSchema)) body: UpdateProductInput,
  ) {
    return this.seller.update(user, id, body);
  }

  @Post('products/:id/publish')
  @HttpCode(204)
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.seller.publish(user, id);
  }

  @Post('products/:id/pause')
  @HttpCode(204)
  pause(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.seller.pause(user, id);
  }

  @Post('products/:id/resume')
  @HttpCode(204)
  resume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.seller.resume(user, id);
  }

  @Delete('products/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.seller.remove(user, id);
  }

  @Get('seller/products')
  mine(@CurrentUser() user: AuthUser, @Query(new ZodPipe(mineQuery)) q: { status: string }) {
    return this.seller.mine(user, q.status);
  }

  // ───── 관심상품 (추가 ↔ 해제 ↔ 목록) ─────

  @Post('products/:id/favorite')
  @HttpCode(204)
  async favorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...PUBLIC_PRODUCT },
      select: { id: true },
    });
    if (!product) throw new AppException('NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.favorite.createMany({
        data: [{ userId: user.id, productId: id }],
        skipDuplicates: true,
      });
      if (created.count)
        await tx.product.update({ where: { id }, data: { favoriteCount: { increment: 1 } } });
    });
  }

  @Delete('products/:id/favorite')
  @HttpCode(204)
  async unfavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.favorite.deleteMany({ where: { userId: user.id, productId: id } });
      if (removed.count) {
        await tx.product.updateMany({
          where: { id, favoriteCount: { gt: 0 } },
          data: { favoriteCount: { decrement: 1 } },
        });
      }
    });
  }

  @Get('me/favorites')
  async favorites(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId: user.id, product: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { product: { include: cardInclude } },
    });
    const all = new Set(rows.map((r) => r.productId));
    return rows.map((r) => toCard(r.product, all));
  }

  // ───── 최근 본 상품 (목록 ↔ 전체 삭제 ↔ 개별 삭제) ─────

  @Get('me/recent')
  async recent(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.recentView.findMany({
      where: { userId: user.id, product: { deletedAt: null } },
      orderBy: { viewedAt: 'desc' },
      take: 50,
      include: { product: { include: cardInclude } },
    });
    const favs = await this.products.favoriteSet(
      user.id,
      rows.map((r) => r.productId),
    );
    return rows.map((r) => toCard(r.product, favs));
  }

  @Delete('me/recent')
  @HttpCode(204)
  async clearRecent(@CurrentUser() user: AuthUser) {
    await this.prisma.recentView.deleteMany({ where: { userId: user.id } });
  }

  @Delete('me/recent/:productId')
  @HttpCode(204)
  async removeRecent(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    await this.prisma.recentView.deleteMany({ where: { userId: user.id, productId } });
  }

  // ───── 상품 문의 (작성 ↔ 삭제, 판매자 답변 ↔ 답변 수정) ─────

  @OptionalAuth()
  @Get('products/:id/inquiries')
  inquiries(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.products.inquiries(id, user);
  }

  @Post('products/:id/inquiries')
  @RateLimit({ name: 'inquiry', limit: 10, windowSec: 3600, by: 'user' })
  async ask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(inquirySchema)) body: { question: string; isPrivate: boolean },
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...PUBLIC_PRODUCT },
      select: { sellerId: true },
    });
    if (!product) throw new AppException('NOT_FOUND');
    if (product.sellerId === user.id)
      throw new AppException('FORBIDDEN', '본인 상품에는 문의할 수 없습니다.');
    return this.prisma.inquiry.create({
      data: { productId: id, userId: user.id, question: body.question, isPrivate: body.isPrivate },
      select: { id: true },
    });
  }

  @Delete('inquiries/:id')
  @HttpCode(204)
  async deleteInquiry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const removed = await this.prisma.inquiry.deleteMany({ where: { id, userId: user.id } });
    if (!removed.count) throw new AppException('NOT_FOUND');
  }

  @Post('inquiries/:id/answer')
  async answer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(inquiryAnswerSchema)) body: { answer: string },
  ) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      select: { product: { select: { sellerId: true } } },
    });
    if (!inquiry || inquiry.product.sellerId !== user.id) throw new AppException('NOT_FOUND');
    // 알림(INQUIRY_ANSWERED)은 알림 모듈 도입 시 연결
    return this.prisma.inquiry.update({
      where: { id },
      data: { answer: body.answer, answeredAt: new Date() },
      select: { id: true, answeredAt: true },
    });
  }
}

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, SellerProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
