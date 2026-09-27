import type {
  CreateReviewInput,
  FollowUserDto,
  Page,
  ProductCardDto,
  ReviewDto,
  ReviewSummaryDto,
} from '@shop/shared';
import type { Http } from '../http';

const id = (v: string) => encodeURIComponent(v);
type Follow = { following: boolean; followerCount: number };

export const communityApi = (http: Http) => ({
  createReview: (orderId: string, body: CreateReviewInput) =>
    http.post<{ id: string }>(`/orders/${id(orderId)}/reviews`, body),
  myReview: (orderId: string) => http.get<ReviewDto | null>(`/orders/${id(orderId)}/review`),
  updateReview: (reviewId: string, body: CreateReviewInput) =>
    http.patch<{ id: string }>(`/reviews/${id(reviewId)}`, body),
  deleteReview: (reviewId: string) => http.delete<{ ok: true }>(`/reviews/${id(reviewId)}`),
  reviews: (userId: string, cursor?: string) =>
    http.get<Page<ReviewDto>>(`/users/${id(userId)}/reviews`, { cursor }),
  reviewSummary: (userId: string) => http.get<ReviewSummaryDto>(`/users/${id(userId)}/reviews/summary`),
  follow: (userId: string) => http.post<Follow>(`/users/${id(userId)}/follow`),
  unfollow: (userId: string) => http.delete<Follow>(`/users/${id(userId)}/follow`),
  followers: (userId: string, cursor?: string) =>
    http.get<Page<FollowUserDto>>(`/users/${id(userId)}/followers`, { cursor }),
  following: (userId: string, cursor?: string) =>
    http.get<Page<FollowUserDto>>(`/users/${id(userId)}/following`, { cursor }),
  feed: (cursor?: string) => http.get<Page<ProductCardDto>>('/me/following/feed', { cursor }),
});
