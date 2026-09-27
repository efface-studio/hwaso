import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { createReviewSchema, updateReviewSchema, type CreateReviewInput } from '@shop/shared';
import { z } from 'zod';
import { CurrentUser, OptionalAuth, type AuthUser } from '../common/auth';
import { RateLimit } from '../common/rate-limit';
import { ZodPipe } from '../common/zod.pipe';
import { ProductsModule } from '../products/products.controller';
import { FollowsService } from './follows.service';
import { ReviewsService } from './reviews.service';

const cursorSchema = z.object({ cursor: z.string().max(200).optional() });
type Cursor = { cursor?: string };

@Controller()
export class CommunityController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly follows: FollowsService,
  ) {}

  // ───── 후기: 작성 ↔ 수정 ↔ 삭제 ─────

  @Post('orders/:id/reviews')
  @RateLimit({ name: 'review', limit: 20, windowSec: 3600, by: 'user' })
  createReview(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(createReviewSchema)) b: CreateReviewInput,
  ) {
    return this.reviews.create(u, id, b);
  }

  @Get('orders/:id/review')
  myReview(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.reviews.mine(u, id);
  }

  @Patch('reviews/:id')
  updateReview(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateReviewSchema)) b: CreateReviewInput,
  ) {
    return this.reviews.update(u, id, b);
  }

  @Delete('reviews/:id')
  deleteReview(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.reviews.remove(u, id);
  }

  @OptionalAuth()
  @Get('users/:id/reviews')
  userReviews(
    @Param('id') id: string,
    @Query(new ZodPipe(cursorSchema)) q: Cursor,
    @CurrentUser() u?: AuthUser,
  ) {
    return this.reviews.received(id, q.cursor, u?.id);
  }

  @OptionalAuth()
  @Get('users/:id/reviews/summary')
  reviewSummary(@Param('id') id: string) {
    return this.reviews.summary(id);
  }

  // ───── 팔로우 ↔ 언팔로우 ─────

  @Post('users/:id/follow')
  @HttpCode(200)
  @RateLimit({ name: 'follow', limit: 60, windowSec: 60, by: 'user' })
  follow(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.follows.follow(u, id);
  }

  @Delete('users/:id/follow')
  unfollow(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.follows.unfollow(u, id);
  }

  @OptionalAuth()
  @Get('users/:id/followers')
  followers(
    @Param('id') id: string,
    @Query(new ZodPipe(cursorSchema)) q: Cursor,
    @CurrentUser() u?: AuthUser,
  ) {
    return this.follows.list(id, 'followers', q.cursor, u?.id);
  }

  @OptionalAuth()
  @Get('users/:id/following')
  following(
    @Param('id') id: string,
    @Query(new ZodPipe(cursorSchema)) q: Cursor,
    @CurrentUser() u?: AuthUser,
  ) {
    return this.follows.list(id, 'following', q.cursor, u?.id);
  }

  @Get('me/following/feed')
  feed(@CurrentUser() u: AuthUser, @Query(new ZodPipe(cursorSchema)) q: Cursor) {
    return this.follows.feed(u, q.cursor);
  }
}

@Module({
  imports: [ProductsModule],
  controllers: [CommunityController],
  providers: [ReviewsService, FollowsService],
})
export class CommunityModule {}
