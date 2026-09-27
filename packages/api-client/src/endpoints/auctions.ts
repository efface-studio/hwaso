import type {
  AuctionDto,
  AuctionListQuery,
  AuctionSnapshot,
  BidDto,
  CreateAuctionInput,
  MyBidDto,
  ProductListResponse,
  SellerAuctionDto,
  UpdateAuctionInput,
} from '@shop/shared';
import type { Http, Query } from '../http';

const id = (v: string) => encodeURIComponent(v);

export interface BidResult {
  bidId: string;
  amount: number;
  currentPrice: number;
  endsAt: string;
  extended: boolean;
  ended: boolean;
  orderId: string | null;
  seq: number;
}

/** 입찰마다 새 멱등 키 — 네트워크 재시도 시 같은 키로 보내 중복 입찰을 막는다 */
export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const auctionsApi = (http: Http) => ({
  list: (q: Partial<AuctionListQuery>, signal?: AbortSignal) =>
    http.get<ProductListResponse>('/auctions', q as Query, signal),
  snapshot: (auctionId: string) => http.get<AuctionSnapshot>(`/auctions/${id(auctionId)}`),
  bids: (auctionId: string) => http.get<BidDto[]>(`/auctions/${id(auctionId)}/bids`),
  bid: (auctionId: string, amount: number, idempotencyKey: string) =>
    http.post<BidResult>(`/auctions/${id(auctionId)}/bids`, { amount, idempotencyKey }),
  buyNow: (auctionId: string, idempotencyKey: string) =>
    http.post<BidResult>(`/auctions/${id(auctionId)}/buy-now`, { idempotencyKey }),

  create: (body: CreateAuctionInput) => http.post<AuctionDto>('/auctions', body),
  update: (auctionId: string, body: UpdateAuctionInput) =>
    http.patch<AuctionDto>(`/auctions/${id(auctionId)}`, body),
  schedule: (auctionId: string) => http.post<AuctionDto>(`/auctions/${id(auctionId)}/schedule`),
  unschedule: (auctionId: string) => http.post<AuctionDto>(`/auctions/${id(auctionId)}/unschedule`),
  cancel: (auctionId: string, reason = '') =>
    http.post<AuctionDto>(`/auctions/${id(auctionId)}/cancel`, { reason }),
  mine: () => http.get<SellerAuctionDto[]>('/seller/auctions'),

  myBids: () => http.get<MyBidDto[]>('/me/bids'),
  myWins: () => http.get<MyBidDto[]>('/me/wins'),
});
