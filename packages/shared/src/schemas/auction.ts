import '../zod-config';
import * as z from 'zod';
import { AUCTION_LIMITS } from '../auction';
import { cursorQuery, id, positiveMoney } from './common';

const isoDateTime = z.iso.datetime({ offset: true });

export const createAuctionSchema = z
  .strictObject({
    productId: id,
    startPrice: positiveMoney.min(AUCTION_LIMITS.minStartPrice, '시작가는 1,000원 이상이어야 합니다.'),
    bidIncrement: positiveMoney.min(AUCTION_LIMITS.minIncrement, '입찰 단위는 100원 이상이어야 합니다.'),
    buyNowPrice: positiveMoney.nullish(),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    autoExtend: z.boolean().default(true),
    description: z.string().trim().max(2000).default(''),
  })
  .superRefine((v, ctx) => {
    if (new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: '종료 시간은 시작 시간 이후여야 합니다.' });
    }
    if (v.buyNowPrice != null && v.buyNowPrice <= v.startPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['buyNowPrice'],
        message: '즉시 구매가는 시작가보다 높아야 합니다.',
      });
    }
  });
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

export const updateAuctionSchema = z.strictObject({
  startPrice: positiveMoney.min(AUCTION_LIMITS.minStartPrice).optional(),
  bidIncrement: positiveMoney.min(AUCTION_LIMITS.minIncrement).optional(),
  buyNowPrice: positiveMoney.nullish(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  autoExtend: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
});
export type UpdateAuctionInput = z.infer<typeof updateAuctionSchema>;

/** 클라이언트가 보낼 수 있는 값은 금액과 멱등 키뿐이다 */
export const placeBidSchema = z.strictObject({
  amount: positiveMoney,
  idempotencyKey: z.string().min(8).max(64),
});
export type PlaceBidInput = z.infer<typeof placeBidSchema>;

export const buyNowSchema = z.strictObject({
  idempotencyKey: z.string().min(8).max(64),
});

export const cancelAuctionSchema = z.strictObject({
  reason: z.string().trim().max(500).default(''),
});

export const auctionListQuery = cursorQuery.extend({
  status: z.enum(['live', 'scheduled', 'ended']).default('live'),
  sort: z.enum(['ending_soon', 'popular', 'latest']).default('ending_soon'),
});
export type AuctionListQuery = z.infer<typeof auctionListQuery>;
