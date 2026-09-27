import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import {
  auctionListQuery,
  buyNowSchema,
  cancelAuctionSchema,
  createAuctionSchema,
  placeBidSchema,
  updateAuctionSchema,
  type AuctionListQuery,
  type CreateAuctionInput,
  type PlaceBidInput,
  type UpdateAuctionInput,
} from '@shop/shared';
import { CurrentUser, OptionalAuth, type AuthUser } from '../common/auth';
import { RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { IdentityModule } from '../identity/identity.controller';
import { ProductsModule } from '../products/products.controller';
import { RealtimeGatewayModule } from '../realtime/realtime';
import { AuctionScheduler } from './auction-scheduler';
import { AuctionsService } from './auctions.service';
import { BiddingService } from './bidding.service';

@Controller()
export class AuctionsController {
  constructor(
    private readonly auctions: AuctionsService,
    private readonly bidding: BiddingService,
  ) {}

  @OptionalAuth()
  @Get('auctions')
  list(@Query(new ZodPipe(auctionListQuery)) q: AuctionListQuery, @CurrentUser() user?: AuthUser) {
    return this.auctions.list(q, user);
  }

  @OptionalAuth()
  @Get('auctions/:id')
  snapshot(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.auctions.snapshot(id, user);
  }

  @OptionalAuth()
  @Get('auctions/:id/bids')
  bids(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.auctions.bids(id, user);
  }

  /** 입찰 — 사용자당 10회/10초 (docs/API.md) */
  @Post('auctions/:id/bids')
  @RateLimit({ name: 'bid', limit: 10, windowSec: 10, by: 'user' })
  bid(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(placeBidSchema)) body: PlaceBidInput,
  ) {
    return this.bidding.placeBid(user, id, body.amount, body.idempotencyKey);
  }

  @Post('auctions/:id/buy-now')
  @RateLimit({ name: 'bid', limit: 10, windowSec: 10, by: 'user' })
  buyNow(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(buyNowSchema)) body: { idempotencyKey: string },
  ) {
    return this.bidding.buyNow(user, id, body.idempotencyKey);
  }

  // ───── 판매자: 등록 ↔ 수정 ↔ 예약 ↔ 예약 취소 ↔ 취소 ─────

  @Post('auctions')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createAuctionSchema)) body: CreateAuctionInput) {
    return this.auctions.create(user, body);
  }

  @Patch('auctions/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateAuctionSchema)) body: UpdateAuctionInput,
  ) {
    return this.auctions.update(user, id, body);
  }

  @Post('auctions/:id/schedule')
  @HttpCode(200)
  schedule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auctions.schedule(user, id);
  }

  @Post('auctions/:id/unschedule')
  @HttpCode(200)
  unschedule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auctions.unschedule(user, id);
  }

  @Post('auctions/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(cancelAuctionSchema)) body: { reason: string },
  ) {
    return this.auctions.cancel(user, id, body.reason);
  }

  @Get('seller/auctions')
  sellerAuctions(@CurrentUser() user: AuthUser) {
    return this.auctions.sellerAuctions(user);
  }

  // ───── 입찰 내역 · 낙찰 내역 ─────

  @Get('me/bids')
  myBids(@CurrentUser() user: AuthUser) {
    return this.auctions.myBids(user, false);
  }

  @Get('me/wins')
  myWins(@CurrentUser() user: AuthUser) {
    return this.auctions.myBids(user, true);
  }
}

@Module({
  imports: [ProductsModule, IdentityModule, RealtimeGatewayModule],
  controllers: [AuctionsController],
  providers: [AuctionsService, BiddingService, AuctionScheduler],
  exports: [AuctionScheduler, AuctionsService],
})
export class AuctionsModule {}
