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
import { emailSchema, nicknameSchema, passwordSchema } from './schemas/auth';
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

/** 기간 정지 빠른 선택 (일). 직접 고르면 종료 일시를 받는다 */
export const SUSPEND_PRESET_DAYS = [1, 3, 7, 30] as const;
/** 기간 정지 상한 (약 5년) */
export const SUSPEND_MAX_DAYS = 1826;

/** 이용 정지: until 이 null 이면 영구 정지. 종료 시각이 지나면 다음 로그인(또는 워커)에서 풀린다 */
export const suspendSchema = z.strictObject({
  reason,
  until: z.iso.datetime({ offset: true }).nullable().default(null),
});
export type SuspendInput = z.input<typeof suspendSchema>;

/**
 * 관리자 회원 정보 수정. 역할·정지는 기존 조치(PATCH role, suspend/restore)를 그대로 쓴다.
 * emailVerified: true 면 인증 완료로 기록, false 면 인증 전으로 되돌린다 (이메일만 바꾸면 그대로 둔다).
 */
export const adminUpdateUserSchema = z
  .strictObject({
    nickname: nicknameSchema.optional(),
    email: emailSchema.optional(),
    emailVerified: z.boolean().optional(),
    bio: z.string().trim().max(300).optional(),
    region: z.string().trim().max(50).nullable().optional(),
    /** 판매자 등록 회원만 */
    businessName: z.string().trim().max(60).nullable().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'reason'), { message: '바꿀 항목을 입력해주세요.' });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

/**
 * 계정 생성 화면에서 고를 수 있는 역할. 판매자는 정산 계좌 등록(회원 본인)이 필요해 고를 수 없고,
 * 관리자는 최고 관리자만 고를 수 있다 (서버가 역할 변경과 같은 규칙으로 다시 검사한다)
 */
export const ADMIN_CREATABLE_ROLES = ['USER', 'ADMIN'] as const;

/**
 * 관리자 계정 생성: 인증 메일 없이 이메일 인증 완료로 만든다. password 를 비우면 서버가 임시 비밀번호를 만들어
 * 응답에서 한 번만 돌려준다. 필수 동의는 받지 않은 상태로 두어 첫 로그인 때 동의 화면을 거친다.
 */
export const adminCreateUserSchema = z.strictObject({
  email: emailSchema,
  nickname: nicknameSchema,
  /** 권한 판단은 서버가 한다 (SUPER_ADMIN 은 누구도, ADMIN 은 최고 관리자만) */
  role: z.enum(ROLES).default('USER'),
  password: passwordSchema.optional(),
  reason: z.string().trim().max(500).optional(),
});
export type AdminCreateUserInput = z.input<typeof adminCreateUserSchema>;

export interface AdminCreateUserResult {
  user: AdminUserDetail;
  /** 서버가 만든 임시 비밀번호 (직접 정했으면 null). 다시 볼 수 없다 */
  temporaryPassword: string | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  nickname: string;
  role: Role;
  status: UserStatus;
  statusReason: string | null;
  /** 기간 정지 종료 시각 (정지 중이고 null 이면 영구) */
  suspendedUntil: string | null;
  identityVerified: boolean;
  unpaidStrikes: number;
  isSeller: boolean;
  sellerVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetail extends AdminUserRow {
  emailVerifiedAt: string | null;
  /** 필수 동의 전 (다음 로그인 때 동의 화면) */
  consentRequired: boolean;
  /** 이메일 비밀번호 로그인 가능 여부 (소셜 전용이면 false) */
  hasPassword: boolean;
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

/** 사이트 안 경로만 — `//host`·`/\host` 처럼 다른 사이트로 가는 주소는 막는다 (오픈 리다이렉트) */
export const SITE_PATH = /^\/(?![/\\])[^\s\\]*$/;

export const bannerSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(60),
    subtitle: z.string().trim().max(120).default(''),
    tone: z.enum(['dark', 'light']).default('dark'),
    imageKey: z.string().min(1).max(200),
    link: z.string().trim().regex(SITE_PATH, '사이트 안 경로(/로 시작)만 쓸 수 있어요.').max(300),
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

export const BROADCAST_KINDS = ['NOTICE', 'MARKETING'] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];

export const broadcastSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(200),
  link: z.string().trim().regex(SITE_PATH).max(300).nullable().default(null),
  audience: z.enum(['all', 'sellers', 'buyers']),
  /**
   * NOTICE(기본): 운영 공지 — 모두에게. MARKETING: 광고성 정보 — 수신 동의자에게만, 제목에 (광고),
   * 푸시는 08:00–21:00(KST)에만 (정보통신망법 제50조). 그 밖의 시간에는 알림함에만 남긴다.
   */
  kind: z.enum(BROADCAST_KINDS).optional(),
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

// ───── 서버 로그 (최고 관리자, docs/SECURITY.md "서버 로그 열람") ─────

export const SERVER_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type ServerLogLevel = (typeof SERVER_LOG_LEVELS)[number];
/** 화면에서 고르는 최소 단계 */
export const SERVER_LOG_FILTER_LEVELS = ['info', 'warn', 'error'] as const;
export type ServerLogFilterLevel = (typeof SERVER_LOG_FILTER_LEVELS)[number];

/** 서버가 가린 뒤 내보내는 로그 한 줄. 원문 JSON 은 보내지 않는다 */
export interface ServerLogEntry {
  /** 프로세스 안에서 단조 증가 (중복 제거·이어 받기용) */
  seq: number;
  time: string;
  level: ServerLogLevel;
  msg: string;
  context?: string;
  reqId?: string;
  method?: string;
  url?: string;
  status?: number;
  ms?: number;
  /** 에러 종류·메시지 (스택은 보내지 않는다) */
  err?: { type: string; message: string };
  /** 나머지 단일 값 필드 (가린 뒤, 최대 20개) */
  fields?: Record<string, string | number | boolean | null>;
}

export const serverLogQuery = z.object({
  level: z.enum(SERVER_LOG_FILTER_LEVELS).default('info'),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  /** 이 seq 다음부터 (재연결 때 빈 구간 채우기) */
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export interface ServerLogQuery {
  level?: ServerLogFilterLevel;
  q?: string;
  after?: number;
  limit?: number;
}

export interface ServerLogTail {
  entries: ServerLogEntry[];
  /** 로그를 보낸 API 프로세스 (여러 대면 서로 다름) */
  instance: string;
  /** 메모리에 보관하는 최대 줄 수 */
  capacity: number;
}

/** 실시간 로그 Socket.IO namespace — 연결 auth: { token } (최고 관리자) */
export const LOG_NAMESPACE = '/admin-logs';

export interface LogServerToClientEvents {
  /** 0.5초마다 모아서 보낸다. dropped: 너무 많아 건너뛴 줄 수 */
  SERVER_LOG: (p: { entries: ServerLogEntry[]; dropped: number }) => void;
}

export interface LogClientToServerEvents {
  'logs:filter': (
    p: { level?: ServerLogFilterLevel; q?: string },
    ack: (res: { ok: true } | { ok: false; code: string }) => void,
  ) => void;
}
