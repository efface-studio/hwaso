import '../zod-config';
import * as z from 'zod';
import { PAYMENT_METHODS } from '../enums';
import { cursorQuery, id, positiveMoney } from './common';

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d]/g, ''))
  .pipe(z.string().regex(/^0\d{8,10}$/, '올바른 전화번호를 입력해주세요.'));

export const addressSchema = z.strictObject({
  recipient: z.string().trim().min(1, '받는 분을 입력해주세요.').max(50),
  phone: phoneSchema,
  zipCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, '우편번호 5자리를 입력해주세요.'),
  address1: z.string().trim().min(1, '주소를 입력해주세요.').max(200),
  address2: z.string().trim().max(200).default(''),
  memo: z.string().trim().max(200).default(''),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const cartItemSchema = z.strictObject({
  quantity: z.number().int().min(1).max(99).default(1),
});

const orderItems = z
  .array(z.strictObject({ productId: id, quantity: z.number().int().min(1).max(99) }))
  .min(1)
  .max(50);
const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .max(40)
  .optional()
  .transform((v) => v || undefined);

/** 결제 전 금액 미리보기 (주문을 만들지 않는다) */
export const quoteOrderSchema = z.strictObject({ items: orderItems, couponCode });
export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;

export const createOrderSchema = z.strictObject({
  items: orderItems,
  addressId: id,
  couponCode,
  fromCart: z.boolean().default(false),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const preparePaymentSchema = z.strictObject({
  method: z.enum(PAYMENT_METHODS),
  /** 낙찰 주문처럼 배송지 없이 만들어진 주문은 결제 전에 배송지를 정한다 */
  addressId: id.optional(),
});
export type PreparePaymentInput = z.infer<typeof preparePaymentSchema>;

export const ORDER_LIST_FILTERS = ['all', 'pending', 'progress', 'done', 'cancelled'] as const;
export const orderListQuery = cursorQuery.extend({
  filter: z.enum(ORDER_LIST_FILTERS).default('all'),
});
export type OrderListQuery = z.infer<typeof orderListQuery>;

export const refundRequestSchema = z.strictObject({
  reason: z.string().trim().min(5, '사유를 5자 이상 입력해주세요.').max(1000),
});

export const confirmPaymentSchema = z.strictObject({
  paymentId: id,
  paymentKey: z.string().min(1).max(200),
  /** PG 가 돌려준 금액. 서버는 주문 금액과 대조만 하며 이 값을 신뢰하지 않는다 */
  amount: positiveMoney,
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

export const cancelOrderSchema = z.strictObject({
  reason: z.string().trim().min(1, '사유를 입력해주세요.').max(500),
});

export const shipOrderSchema = z.strictObject({
  carrier: z.string().trim().min(1).max(50),
  trackingNumber: z.string().trim().min(4).max(50),
});

export const sellerRegisterSchema = z.strictObject({
  businessName: z.string().trim().max(100).optional(),
  bankName: z.string().trim().min(1, '은행을 선택해주세요.').max(30),
  bankAccount: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d]/g, ''))
    .pipe(z.string().regex(/^\d{8,20}$/, '계좌번호를 확인해주세요.')),
  accountHolder: z.string().trim().min(1).max(50),
});
export type SellerRegisterInput = z.infer<typeof sellerRegisterSchema>;

export const sellerUpdateSchema = sellerRegisterSchema.partial();
export type SellerUpdateInput = z.infer<typeof sellerUpdateSchema>;
