import '../zod-config';
import * as z from 'zod';
import { ITEM_CONDITIONS, PRODUCT_SORTS, PROVENANCE_KINDS, SALE_TYPES } from '../enums';
import { csv, cursorQuery, id, money, positiveMoney, queryBool } from './common';

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullish();
const dimension = z.number().positive().max(100_000).nullish();
const year = z.number().int().min(-3000).max(2100).nullish();

export const MAX_PRODUCT_IMAGES = 20;

export const productImageInput = z.strictObject({
  key: z.string().min(1).max(200),
});

export const certificateInput = z.strictObject({
  issuer: text(100).min(1),
  number: text(100).min(1),
  issuedAt: z.iso.date().nullish(),
  imageKey: z.string().max(200).nullish(),
  authenticityNote: text(2000).default(''),
});

export const provenanceInput = z.strictObject({
  kind: z.enum(PROVENANCE_KINDS),
  period: text(50).min(1),
  title: text(200).min(1),
  description: text(1000).default(''),
});

const productFields = {
  title: text(100).min(2, '상품명은 2자 이상 입력해주세요.'),
  categoryId: id,
  description: text(10_000).default(''),
  images: z
    .array(productImageInput)
    .min(1, '사진을 1장 이상 올려주세요.')
    .max(MAX_PRODUCT_IMAGES, `사진은 최대 ${MAX_PRODUCT_IMAGES}장까지 올릴 수 있습니다.`),
  saleType: z.enum(SALE_TYPES),
  price: positiveMoney.nullish(),
  stock: z.number().int().min(1).max(999).default(1),
  availableAt: z.iso.datetime({ offset: true }).nullish(),
  artistId: id.nullish(),
  artistName: optText(100),
  maker: optText(100),
  brand: optText(100),
  era: optText(50),
  productionYear: year,
  material: optText(100),
  widthCm: dimension,
  heightCm: dimension,
  depthCm: dimension,
  condition: z.enum(ITEM_CONDITIONS).default('GOOD'),
  conditionNote: optText(1000),
  region: optText(50),
  shippingFee: money.default(0),
  shippingMethod: text(100).default('택배'),
  returnPolicy: text(1000).default(
    '작품 특성상 단순 변심에 의한 반품은 어렵습니다. 상품 설명과 다른 경우 반품 가능합니다.',
  ),
  certificate: certificateInput.nullish(),
  provenance: z.array(provenanceInput).max(50).default([]),
  publish: z.boolean().default(true),
};

const priceRule = <T extends { saleType?: string; price?: number | null; availableAt?: string | null }>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if ((v.saleType === 'FIXED' || v.saleType === 'RESERVATION') && !v.price) {
    ctx.addIssue({ code: 'custom', path: ['price'], message: '판매 가격을 입력해주세요.' });
  }
  if (v.saleType === 'RESERVATION' && !v.availableAt) {
    ctx.addIssue({ code: 'custom', path: ['availableAt'], message: '예약 판매 시작일을 입력해주세요.' });
  }
};

export const createProductSchema = z.strictObject(productFields).superRefine(priceRule);
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .strictObject(productFields)
  .omit({ publish: true })
  .partial()
  .superRefine((v, ctx) => {
    if (v.saleType) priceRule(v, ctx);
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productListQuery = cursorQuery.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(60).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  saleType: csv(z.enum(SALE_TYPES)).optional(),
  artist: z.string().max(40).optional(),
  seller: z.string().max(40).optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  era: csv(z.string().max(50)).optional(),
  material: csv(z.string().max(100)).optional(),
  condition: csv(z.enum(ITEM_CONDITIONS)).optional(),
  region: csv(z.string().max(50)).optional(),
  auctionOnly: queryBool.optional(),
  verifiedOnly: queryBool.optional(),
  sort: z.enum(PRODUCT_SORTS).default('latest'),
});
export type ProductListQuery = z.infer<typeof productListQuery>;
export type ProductListParams = z.input<typeof productListQuery>;

export const inquirySchema = z.strictObject({
  question: text(1000).min(2),
  isPrivate: z.boolean().default(false),
});
export const inquiryAnswerSchema = z.strictObject({ answer: text(2000).min(1) });
