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
} from '@nestjs/common';
import {
  addressSchema,
  cancelOrderSchema,
  cartItemSchema,
  confirmPaymentSchema,
  createOrderSchema,
  orderListQuery,
  preparePaymentSchema,
  quoteOrderSchema,
  refundRequestSchema,
  shipOrderSchema,
  type AddressInput,
  type ConfirmPaymentInput,
  type CreateOrderInput,
  type OrderListQuery,
  type PreparePaymentInput,
  type QuoteOrderInput,
} from '@shop/shared';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { CartService } from './cart.service';
import { OrderScheduler } from './order-scheduler';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { TossClient } from './toss.client';

type Reason = { reason: string };
type Ship = { carrier: string; trackingNumber: string };

@Controller()
export class OrdersController {
  constructor(
    private readonly cart: CartService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  // ───── 배송지 ─────

  @Get('me/addresses')
  addresses(@CurrentUser() u: AuthUser) {
    return this.cart.addresses(u.id);
  }

  @Post('me/addresses')
  createAddress(@CurrentUser() u: AuthUser, @Body(new ZodPipe(addressSchema)) body: AddressInput) {
    return this.cart.createAddress(u.id, body);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(addressSchema)) body: AddressInput,
  ) {
    return this.cart.updateAddress(u.id, id, body);
  }

  @Delete('me/addresses/:id')
  deleteAddress(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cart.deleteAddress(u.id, id);
  }

  // ───── 장바구니 ─────

  @Get('cart')
  getCart(@CurrentUser() u: AuthUser) {
    return this.cart.cart(u.id);
  }

  @Put('cart/:productId')
  putCart(
    @CurrentUser() u: AuthUser,
    @Param('productId') id: string,
    @Body(new ZodPipe(cartItemSchema)) body: { quantity: number },
  ) {
    return this.cart.put(u.id, id, body.quantity);
  }

  @Delete('cart/:productId')
  removeCart(@CurrentUser() u: AuthUser, @Param('productId') id: string) {
    return this.cart.remove(u.id, [id]);
  }

  @Delete('cart')
  clearCart(@CurrentUser() u: AuthUser) {
    return this.cart.remove(u.id, 'all');
  }

  // ───── 주문 ─────

  @Post('orders/quote')
  @HttpCode(200)
  quote(@CurrentUser() u: AuthUser, @Body(new ZodPipe(quoteOrderSchema)) body: QuoteOrderInput) {
    return this.orders.quote(u, body);
  }

  @Post('orders')
  @RateLimit({ name: 'order', limit: 20, windowSec: 60, by: 'user' })
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput) {
    return this.orders.create(u, body);
  }

  @Get('orders')
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(orderListQuery)) q: OrderListQuery) {
    return this.orders.list(u, 'buyer', q);
  }

  @Get('orders/summary')
  summary(@CurrentUser() u: AuthUser) {
    return this.orders.summary(u, 'buyer');
  }

  @Get('orders/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.detail(u, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(cancelOrderSchema)) b: Reason,
  ) {
    return this.orders.cancel(u, id, b.reason);
  }

  @Post('orders/:id/prepare')
  @HttpCode(200)
  prepare(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.prepare(u, id);
  }

  @Post('orders/:id/ship')
  @HttpCode(200)
  ship(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(shipOrderSchema)) b: Ship) {
    return this.orders.ship(u, id, b);
  }

  @Patch('orders/:id/shipment')
  updateShipment(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(shipOrderSchema)) b: Ship,
  ) {
    return this.orders.updateShipment(u, id, b);
  }

  @Post('orders/:id/deliver')
  @HttpCode(200)
  deliver(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.deliver(u, id);
  }

  @Post('orders/:id/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.confirm(u, id);
  }

  @Post('orders/:id/refund-request')
  @HttpCode(200)
  refundRequest(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(refundRequestSchema)) b: Reason,
  ) {
    return this.orders.refundRequest(u, id, b.reason);
  }

  @Post('orders/:id/refund')
  @HttpCode(200)
  refund(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.refundApprove(u, id);
  }

  @Post('orders/:id/refund-reject')
  @HttpCode(200)
  refundReject(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(cancelOrderSchema)) b: Reason,
  ) {
    return this.orders.refundReject(u, id, b.reason);
  }

  // ───── 결제 ─────

  @Post('orders/:id/payments')
  @RateLimit({ name: 'payment', limit: 20, windowSec: 60, by: 'user' })
  preparePayment(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(preparePaymentSchema)) b: PreparePaymentInput,
  ) {
    return this.payments.prepare(u, id, b);
  }

  @Post('payments/confirm')
  @HttpCode(200)
  @RateLimit({ name: 'payment', limit: 20, windowSec: 60, by: 'user' })
  confirmPayment(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(confirmPaymentSchema)) b: ConfirmPaymentInput,
  ) {
    return this.payments.confirm(u, b);
  }

  /** PG 웹훅: 인증 없이 받되 본문을 믿지 않고 PG 에 재조회한다 */
  @Public()
  @Post('payments/webhook/toss')
  @HttpCode(200)
  @RateLimit({ name: 'webhook', limit: 300, windowSec: 60, by: 'ip' })
  webhook(@Body() body: unknown) {
    return this.payments.webhook(body);
  }

  /** 개발 환경 전용: 모의 가상계좌 입금 */
  @Post('payments/:id/mock-deposit')
  @HttpCode(200)
  mockDeposit(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.payments.mockDeposit(u, id);
  }

  // ───── 판매자 ─────

  @Get('seller/orders')
  sellerOrders(@CurrentUser() u: AuthUser, @Query(new ZodPipe(orderListQuery)) q: OrderListQuery) {
    return this.orders.list(u, 'seller', q);
  }

  @Get('seller/orders/summary')
  sellerSummary(@CurrentUser() u: AuthUser) {
    return this.orders.summary(u, 'seller');
  }

  @Get('seller/settlements')
  settlements(@CurrentUser() u: AuthUser) {
    return this.orders.settlements(u);
  }
}

@Module({
  controllers: [OrdersController],
  providers: [CartService, OrdersService, PaymentsService, TossClient, OrderScheduler],
  exports: [OrdersService, PaymentsService, OrderScheduler],
})
export class OrdersModule {}
