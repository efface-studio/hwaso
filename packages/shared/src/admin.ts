import './zod-config';
import * as z from 'zod';
import type {
  AuctionStatus,
  CategoryGroup,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  ReportReason,
  ReportStatus,
  ReportTarget,
  Role,
  SaleType,
  SettlementStatus,
  UserStatus,
  VerificationStatus,
} from './enums';
import {
  CATEGORY_GROUPS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  REPORT_STATUSES,
  REPORT_TARGETS,
  ROLES,
  SETTLEMENT_STATUSES,
  USER_STATUSES,
  VERIFICATION_STATUSES,
} from './enums';
import type { ImageDto, UserSummary } from './dto';
import { id, money } from './schemas/common';

// ───── 공통 ─────

/** 관리자 표는 페이지 번호 방식 (총 건수 표시·이동이 필요) */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
});
export type PageQuery = z.infer<typeof pageQuery>;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

const reason = z.string().trim().min(2, '사유를 입력해주세요.').max(500);
export const reasonSchema = z.strictObject({ reason });

// ───── 대시보드 ─────

export interface AdminDashboardDto {
  users: { total: number; today: number; suspended: number };
  sellers: { total: number; pendingVerification: number };
  products: { active: number; pendingCertificates: number };
  auctions: { live: number; scheduled: number; endingToday: number };
  orders: { today: number; gmvToday: number; gmv30d: number; paymentPending: number; toShip: number };
  issues: { refundRequests: number; openReports: number; unpaidAuctions: number };
  settlements: { scheduledAmount: number; heldAmount: number };
  /** 최근 14일 (오래된 날부터): 날짜·가입·주문·거래액 */
  series: { date: string; signups: number; orders: number; gmv: number }[];
}

// ───── 회원 · 판매자 ─────

export const adminUsersQuery = pageQuery.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuery>;

export const adminRoleSchema = z.strictObject({ role: z.enum(ROLES) });

export interface AdminUserRow {
  id: string;
  email: string;
  nickname: string;
  role: Role;
  status: UserStatus;
  statusReason: string | null;
  identityVerified: boolean;
  unpaidStrikes: number;
  isSeller: boolean;
  sellerVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetail extends AdminUserRow {
  profile: { bio: string; region: string | null; ratingAvg: number; ratingCount: number; tradeCount: number };
  seller: {
    businessName: string | null;
    bankName: string;
    bankAccountMasked: string;
    accountHolder: string;
  } | null;
  counts: {
    products: number;
    ordersBought: number;
    ordersSold: number;
    bids: number;
    reportsAgainst: number;
  };
  socialProviders: string[];
}

export const adminSellersQuery = pageQuery.extend({
  verified: z.enum(['all', 'pending', 'verified']).default('all'),
});

// ───── 작품 · 인증서 · 카테고리 ─────

export const adminProductsQuery = pageQuery.extend({
  status: z.enum(PRODUCT_STATUSES).optional(),
  verification: z.enum(VERIFICATION_STATUSES).optional(),
});
export type AdminProductsQuery = z.infer<typeof adminProductsQuery>;

export interface AdminProductRow {
  id: string;
  title: string;
  image: ImageDto | null;
  seller: UserSummary;
  saleType: SaleType;
  status: ProductStatus;
  price: number | null;
  verificationStatus: VerificationStatus;
  certificate: { issuer: string; number: string; imageKey: string | null; reviewNote: string | null } | null;
  reportCount: number;
  createdAt: string;
  deletedAt: string | null;
}

export const certificateReviewSchema = z.strictObject({
  status: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().trim().max(500).default(''),
});

export const categorySchema = z.strictObject({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, '영문 소문자·숫자·하이픈 2~40자'),
  name: z.string().trim().min(1).max(40),
  group: z.enum(CATEGORY_GROUPS),
  parentId: id.nullable().default(null),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export interface AdminCategoryRow {
  id: string;
  slug: string;
  name: string;
  group: CategoryGroup;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

// ───── 경매 ─────

export const adminAuctionsQuery = pageQuery.extend({ status: z.string().max(20).optional() });

export interface AdminAuctionRow {
  id: string;
  productId: string;
  title: string;
  seller: UserSummary;
  status: AuctionStatus;
  result: string;
  currentPrice: number;
  bidCount: number;
  startsAt: string;
  endsAt: string;
}

export const auctionPolicySchema = z.strictObject({
  extensionWindowSec: z.number().int().min(0).max(600),
  extensionSec: z.number().int().min(0).max(600),
  maxExtensionSec: z.number().int().min(0).max(86_400),
  paymentDueHours: z.number().int().min(1).max(336),
  minDurationMin: z.number().int().min(1).max(10_080),
  maxDurationDays: z.number().int().min(1).max(60),
  endingSoonMin: z.number().int().min(1).max(1440),
});
export type AuctionPolicyInput = z.infer<typeof auctionPolicySchema>;

// ───── 주문 · 결제 · 정산 · 쿠폰 ─────

export const adminOrdersQuery = pageQuery.extend({ status: z.enum(ORDER_STATUSES).optional() });

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: 'DIRECT' | 'AUCTION';
  title: string;
  buyer: UserSummary;
  seller: UserSummary;
  totalAmount: number;
  createdAt: string;
}

export const adminPaymentsQuery = pageQuery.extend({
  status: z.enum(PAYMENT_STATUSES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
});

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  cancelledAmount: number;
  failureCode: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export const adminSettlementsQuery = pageQuery.extend({ status: z.enum(SETTLEMENT_STATUSES).optional() });

export const settlementActionSchema = z.strictObject({
  ids: z.array(id).min(1).max(100),
  action: z.enum(['pay', 'hold', 'release']),
});

export interface AdminSettlementRow {
  id: string;
  orderId: string;
  orderNumber: string;
  seller: UserSummary;
  bank: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  status: SettlementStatus;
  scheduledAt: string;
  paidAt: string | null;
}

export const couponSchema = z
  .strictObject({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,40}$/, '영문 대문자·숫자·-·_ 3~40자'),
    name: z.string().trim().min(1).max(60),
    type: z.enum(['FIXED', 'PERCENT']),
    value: money.positive(),
    minOrderAmount: money.default(0),
    maxDiscount: money.positive().nullable().default(null),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    usageLimit: z.number().int().positive().nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .refine((c) => c.type === 'FIXED' || c.value <= 90, {
    message: '할인율은 90% 이하로 정해주세요.',
    path: ['value'],
  })
  .refine((c) => Date.parse(c.endsAt) > Date.parse(c.startsAt), {
    message: '종료일을 확인해주세요.',
    path: ['endsAt'],
  });
export type CouponInput = z.infer<typeof couponSchema>;

export interface AdminCouponRow extends CouponInput {
  id: string;
  usedCount: number;
  createdAt: string;
}

// ───── 신고 ─────

export const adminReportsQuery = pageQuery.extend({
  status: z.enum(REPORT_STATUSES).optional(),
  targetType: z.enum(REPORT_TARGETS).optional(),
});

export const REPORT_ACTIONS = [
  'none',
  'hide_product',
  'suspend_user',
  'delete_message',
  'delete_review',
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const reportResolveSchema = z.strictObject({
  status: z.enum(['IN_REVIEW', 'RESOLVED', 'REJECTED']),
  resolution: z.string().trim().max(500).default(''),
  action: z.enum(REPORT_ACTIONS).default('none'),
});

export interface AdminReportRow {
  id: string;
  reporter: UserSummary;
  targetType: ReportTarget;
  targetId: string;
  /** 대상 요약 (작품 제목·메시지 내용·후기 내용·닉네임) */
  targetPreview: string;
  targetOwner: UserSummary | null;
  reason: ReportReason;
  detail: string;
  status: ReportStatus;
  resolution: string | null;
  sameTargetCount: number;
  createdAt: string;
}

// ───── 콘텐츠 ─────

export const bannerSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(60),
    subtitle: z.string().trim().max(120).default(''),
    tone: z.enum(['dark', 'light']).default('dark'),
    imageKey: z.string().min(1).max(200),
    link: z
      .string()
      .trim()
      .regex(/^\/[^\s]*$/, '사이트 안 경로(/로 시작)만 쓸 수 있어요.')
      .max(300),
    placement: z.enum(['home']).default('home'),
    sortOrder: z.number().int().min(0).max(999).default(0),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    isActive: z.boolean().default(true),
  })
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), {
    message: '종료일을 확인해주세요.',
    path: ['endsAt'],
  });
export type BannerInput = z.infer<typeof bannerSchema>;

export interface AdminBannerRow extends BannerInput {
  id: string;
  /** 현재 노출 중 (활성 + 기간 안) */
  live: boolean;
}

export const noticeSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(20_000),
  isPinned: z.boolean().default(false),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
});
export type NoticeInput = z.infer<typeof noticeSchema>;

export interface NoticeDto {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  updatedAt: string;
}

export const broadcastSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(200),
  link: z
    .string()
    .trim()
    .regex(/^\/[^\s]*$/)
    .max(300)
    .nullable()
    .default(null),
  audience: z.enum(['all', 'sellers', 'buyers']),
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;

// ───── 감사 로그 ─────

export const auditQuery = pageQuery.extend({
  targetType: z.string().max(40).optional(),
  actorId: id.optional(),
});

export interface AuditLogRow {
  id: string;
  actor: UserSummary | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}
