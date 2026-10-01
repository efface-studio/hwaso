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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReportStatus,
  ReportTarget,
  Role,
  SettlementStatus,
} from '@prisma/client';
import {
  adminAuctionsQuery,
  adminOrdersQuery,
  adminPaymentsQuery,
  adminProductsQuery,
  adminReportsQuery,
  adminRoleSchema,
  adminSellersQuery,
  adminSettlementsQuery,
  adminUsersQuery,
  auctionPolicySchema,
  auditQuery,
  bannerSchema,
  broadcastSchema,
  categorySchema,
  certificateReviewSchema,
  couponSchema,
  noticeSchema,
  pageQuery,
  reasonSchema,
  reportResolveSchema,
  settlementActionSchema,
  type AdminProductsQuery,
  type AdminUsersQuery,
  type AuctionPolicyInput,
  type BannerInput,
  type BroadcastInput,
  type CategoryInput,
  type CouponInput,
  type NoticeInput,
  type PageQuery,
  type ReportAction,
} from '@shop/shared';
import { AuctionsModule } from '../auctions/auctions.controller';
import { AuctionsService } from '../auctions/auctions.service';
import { AuthModule } from '../auth/auth.controller';
import { CurrentUser, Public, Roles, type AuthedRequest, type AuthUser } from '../common/auth';
import { PublicCache } from '../common/http-cache';
import { clientIp } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { OrdersModule } from '../orders/orders.controller';
import { OrdersService } from '../orders/orders.service';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminCommerceService } from './admin-commerce.service';
import { AdminContentService } from './admin-content.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminUsersService } from './admin-users.service';
import { AuditService, type AuditContext } from './audit.service';

type Reason = { reason: string };
const ctx = (req: AuthedRequest): AuditContext => ({ user: req.user!, ip: clientIp(req) });

/** 관리자 API. 모든 쓰기 작업은 감사 로그를 남긴다 (docs/API.md "Admin") */
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly users: AdminUsersService,
    private readonly catalog: AdminCatalogService,
    private readonly commerce: AdminCommerceService,
    private readonly content: AdminContentService,
    private readonly reports: AdminReportsService,
    private readonly audit: AuditService,
    private readonly auctions: AuctionsService,
    private readonly orders: OrdersService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboard.get();
  }

  // ───── 회원 · 판매자 ─────

  @Get('users')
  listUsers(@Query(new ZodPipe(adminUsersQuery)) q: AdminUsersQuery) {
    return this.users.list(q);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  suspend(@Req() req: AuthedRequest, @Param('id') id: string, @Body(new ZodPipe(reasonSchema)) b: Reason) {
    return this.users.suspend(ctx(req), id, b.reason);
  }

  @Post('users/:id/restore')
  @HttpCode(200)
  restore(@Req() req: AuthedRequest, @Param('id') id: string, @Body(new ZodPipe(reasonSchema)) b: Reason) {
    return this.users.restore(ctx(req), id, b.reason);
  }

  @Patch('users/:id/role')
  setRole(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(adminRoleSchema)) b: { role: Role },
  ) {
    return this.users.setRole(ctx(req), id, b.role);
  }

  @Post('users/:id/reset-strikes')
  @HttpCode(200)
  resetStrikes(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(reasonSchema)) b: Reason,
  ) {
    return this.users.resetStrikes(ctx(req), id, b.reason);
  }

  @Get('sellers')
  listSellers(
    @Query(new ZodPipe(adminSellersQuery)) q: PageQuery & { verified: 'all' | 'pending' | 'verified' },
  ) {
    return this.users.sellers(q);
  }

  @Post('sellers/:id/verify')
  @HttpCode(200)
  verifySeller(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.users.verifySeller(ctx(req), id, true);
  }

  @Post('sellers/:id/unverify')
  @HttpCode(200)
  unverifySeller(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.users.verifySeller(ctx(req), id, false);
  }

  // ───── 작품 · 인증서 · 카테고리 ─────

  @Get('products')
  listProducts(@Query(new ZodPipe(adminProductsQuery)) q: AdminProductsQuery) {
    return this.catalog.products(q);
  }

  @Post('products/:id/hide')
  @HttpCode(200)
  hideProduct(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(reasonSchema)) b: Reason,
  ) {
    return this.catalog.moderateProduct(ctx(req), id, 'hide', b.reason);
  }

  @Post('products/:id/restore')
  @HttpCode(200)
  restoreProduct(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(reasonSchema)) b: Reason,
  ) {
    return this.catalog.moderateProduct(ctx(req), id, 'restore', b.reason);
  }

  @Delete('products/:id')
  deleteProduct(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(reasonSchema)) b: Reason,
  ) {
    return this.catalog.deleteProduct(ctx(req), id, b.reason);
  }

  @Post('products/:id/certificate')
  @HttpCode(200)
  reviewCertificate(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(certificateReviewSchema)) b: { status: 'VERIFIED' | 'REJECTED'; note: string },
  ) {
    return this.catalog.reviewCertificate(ctx(req), id, b.status, b.note);
  }

  @Get('categories')
  listCategories() {
    return this.catalog.categories();
  }

  @Post('categories')
  createCategory(@Req() req: AuthedRequest, @Body(new ZodPipe(categorySchema)) b: CategoryInput) {
    return this.catalog.createCategory(ctx(req), b);
  }

  @Put('categories/:id')
  updateCategory(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(categorySchema)) b: CategoryInput,
  ) {
    return this.catalog.updateCategory(ctx(req), id, b);
  }

  @Delete('categories/:id')
  deleteCategory(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.catalog.deleteCategory(ctx(req), id);
  }

  // ───── 경매 ─────

  @Get('auctions')
  listAuctions(@Query(new ZodPipe(adminAuctionsQuery)) q: PageQuery & { status?: string }) {
    return this.catalog.auctions(q);
  }

  @Post('auctions/:id/cancel')
  @HttpCode(200)
  async cancelAuction(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(reasonSchema)) b: Reason,
  ) {
    const r = await this.auctions.cancel(req.user!, id, b.reason);
    await this.audit.log(ctx(req), 'auction.cancel', 'AUCTION', id, null, { reason: b.reason });
    return r;
  }

  @Get('auction-policy')
  getPolicy() {
    return this.catalog.policy();
  }

  @Put('auction-policy')
  setPolicy(@Req() req: AuthedRequest, @Body(new ZodPipe(auctionPolicySchema)) b: AuctionPolicyInput) {
    return this.catalog.setPolicy(ctx(req), b);
  }

  // ───── 주문 · 결제 · 정산 · 쿠폰 ─────

  @Get('orders')
  listOrders(@Query(new ZodPipe(adminOrdersQuery)) q: PageQuery & { status?: OrderStatus }) {
    return this.commerce.orderList(q);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.detail(u, id);
  }

  @Post('orders/:id/refund')
  @HttpCode(200)
  refund(@Req() req: AuthedRequest, @Param('id') id: string, @Body(new ZodPipe(reasonSchema)) b: Reason) {
    return this.commerce.refund(ctx(req), id, b.reason);
  }

  @Get('payments')
  listPayments(
    @Query(new ZodPipe(adminPaymentsQuery)) q: PageQuery & { status?: PaymentStatus; method?: PaymentMethod },
  ) {
    return this.commerce.paymentList(q);
  }

  @Get('settlements')
  listSettlements(@Query(new ZodPipe(adminSettlementsQuery)) q: PageQuery & { status?: SettlementStatus }) {
    return this.commerce.settlementList(q);
  }

  @Post('settlements/actions')
  @HttpCode(200)
  settlementAction(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(settlementActionSchema)) b: { ids: string[]; action: 'pay' | 'hold' | 'release' },
  ) {
    return this.commerce.settlementAction(ctx(req), b.ids, b.action);
  }

  @Get('coupons')
  listCoupons(@Query(new ZodPipe(pageQuery)) q: PageQuery) {
    return this.commerce.coupons(q);
  }

  @Post('coupons')
  createCoupon(@Req() req: AuthedRequest, @Body(new ZodPipe(couponSchema)) b: CouponInput) {
    return this.commerce.createCoupon(ctx(req), b);
  }

  @Put('coupons/:id')
  updateCoupon(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(couponSchema)) b: CouponInput,
  ) {
    return this.commerce.updateCoupon(ctx(req), id, b);
  }

  @Delete('coupons/:id')
  deleteCoupon(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.commerce.deleteCoupon(ctx(req), id);
  }

  // ───── 신고 ─────

  @Get('reports')
  listReports(
    @Query(new ZodPipe(adminReportsQuery))
    q: PageQuery & { status?: ReportStatus; targetType?: ReportTarget },
  ) {
    return this.reports.list(q);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  resolveReport(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(reportResolveSchema))
    b: { status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'; resolution: string; action: ReportAction },
  ) {
    return this.reports.resolve(ctx(req), id, b);
  }

  // ───── 배너 · 공지 · 전체 알림 ─────

  @Get('banners')
  listBanners() {
    return this.content.banners();
  }

  @Post('banners')
  createBanner(@Req() req: AuthedRequest, @Body(new ZodPipe(bannerSchema)) b: BannerInput) {
    return this.content.createBanner(ctx(req), b);
  }

  @Put('banners/:id')
  updateBanner(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(bannerSchema)) b: BannerInput,
  ) {
    return this.content.updateBanner(ctx(req), id, b);
  }

  @Delete('banners/:id')
  deleteBanner(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.content.deleteBanner(ctx(req), id);
  }

  @Get('notices')
  listNotices(@Query(new ZodPipe(pageQuery)) q: PageQuery) {
    return this.content.notices(q, false);
  }

  @Post('notices')
  createNotice(@Req() req: AuthedRequest, @Body(new ZodPipe(noticeSchema)) b: NoticeInput) {
    return this.content.createNotice(ctx(req), b);
  }

  @Put('notices/:id')
  updateNotice(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(noticeSchema)) b: NoticeInput,
  ) {
    return this.content.updateNotice(ctx(req), id, b);
  }

  @Delete('notices/:id')
  deleteNotice(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.content.deleteNotice(ctx(req), id);
  }

  @Post('broadcast')
  @HttpCode(200)
  broadcast(@Req() req: AuthedRequest, @Body(new ZodPipe(broadcastSchema)) b: BroadcastInput) {
    return this.content.broadcast(ctx(req), b);
  }

  // ───── 감사 로그 ─────

  @Get('audit-logs')
  auditLogs(@Query(new ZodPipe(auditQuery)) q: PageQuery & { targetType?: string; actorId?: string }) {
    return this.audit.list(q);
  }
}

/** 공개 공지사항 */
@Controller('notices')
export class NoticesController {
  constructor(private readonly content: AdminContentService) {}

  @Public()
  @PublicCache(60)
  @Get()
  list(@Query(new ZodPipe(pageQuery)) q: PageQuery) {
    return this.content.notices(q, true);
  }

  @Public()
  @PublicCache(60)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.content.notice(id, true);
  }
}

@Module({
  imports: [AuthModule, OrdersModule, AuctionsModule],
  controllers: [AdminController, NoticesController],
  providers: [
    AuditService,
    AdminDashboardService,
    AdminUsersService,
    AdminCatalogService,
    AdminCommerceService,
    AdminContentService,
    AdminReportsService,
  ],
})
export class AdminModule {}
