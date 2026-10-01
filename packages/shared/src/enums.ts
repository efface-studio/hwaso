// Prisma enum 과 1:1 로 맞춘다 (apps/api/prisma/schema.prisma). 클라이언트는 Prisma 에 의존하지 않도록 여기서 가져간다.

const e = <const T extends readonly string[]>(...v: T) => v;

export const ROLES = e('USER', 'SELLER', 'VERIFIED_SELLER', 'ADMIN', 'SUPER_ADMIN');
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = e('ACTIVE', 'SUSPENDED', 'DELETED');
export type UserStatus = (typeof USER_STATUSES)[number];

export const AUTH_PROVIDERS = e('GOOGLE', 'APPLE', 'KAKAO', 'NAVER');
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const VERIFICATION_PURPOSES = e('SIGNUP', 'RESET_PASSWORD', 'DELETE_ACCOUNT');
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export const PLATFORMS = e('web', 'ios', 'android');
export type Platform = (typeof PLATFORMS)[number];

export const SALE_TYPES = e('FIXED', 'AUCTION', 'RESERVATION');
export type SaleType = (typeof SALE_TYPES)[number];

export const PRODUCT_STATUSES = e(
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'RESERVED',
  'SOLD',
  'SUSPENDED',
  'HIDDEN',
);
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ITEM_CONDITIONS = e('MINT', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR');
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export const VERIFICATION_STATUSES = e('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CATEGORY_GROUPS = e('ART', 'HISTORICAL', 'COLLECTIBLES');
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export const PROVENANCE_KINDS = e('OWNERSHIP', 'EXHIBITION', 'PUBLICATION');
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export const AUCTION_STATUSES = e('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'SETTLED', 'CANCELLED');
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export const AUCTION_RESULTS = e('NONE', 'SOLD', 'NO_BIDS', 'UNPAID');
export type AuctionResult = (typeof AUCTION_RESULTS)[number];

export const ORDER_STATUSES = e(
  'PENDING',
  'PAYMENT_PENDING',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_REQUESTED',
  'REFUNDED',
);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = e('DIRECT', 'AUCTION');
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const PAYMENT_STATUSES = e('READY', 'DONE', 'CANCELLED', 'PARTIAL_REFUNDED', 'REFUNDED', 'FAILED');
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = e('CARD', 'EASY_PAY', 'BANK_TRANSFER', 'VIRTUAL_ACCOUNT');
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPMENT_STATUSES = e('READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED');
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SETTLEMENT_STATUSES = e('PENDING', 'SCHEDULED', 'PAID', 'HELD');
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const NOTIFICATION_TYPES = e(
  'INQUIRY_RECEIVED',
  'REVIEW_RECEIVED',
  'ORDER_UPDATED',
  'FOLLOWING_NEW_ITEM',
  'SECURITY_NEW_DEVICE',
  'WELCOME',
  'BID_PLACED',
  'OUTBID',
  'AUCTION_ENDING',
  'AUCTION_WON',
  'AUCTION_LOST',
  'AUCTION_STARTED',
  'ITEM_SOLD',
  'PAYMENT_DONE',
  'SHIPPED',
  'DELIVERED',
  'INQUIRY_ANSWERED',
  'PRICE_CHANGED',
  'FOLLOWED',
  'FAVORITE_ON_SALE',
  'CHAT_MESSAGE',
  'SYSTEM',
  'ADMIN_REPORT',
  'ADMIN_SELLER_PENDING',
  'ADMIN_CERTIFICATE_PENDING',
  'ADMIN_PAYMENT_ISSUE',
  'ADMIN_APP_UPDATE',
);
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CHAT_MESSAGE_KINDS = e('TEXT', 'IMAGE', 'PRODUCT', 'APPOINTMENT', 'SYSTEM');
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];

export const REVIEW_DIRECTIONS = e('BUYER_TO_SELLER', 'SELLER_TO_BUYER');
export type ReviewDirection = (typeof REVIEW_DIRECTIONS)[number];

export const REPORT_TARGETS = e('PRODUCT', 'USER', 'REVIEW', 'MESSAGE');
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = e('FRAUD', 'FAKE_ITEM', 'COUNTERFEIT', 'COPYRIGHT', 'INAPPROPRIATE', 'OTHER');
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = e('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const COUPON_TYPES = e('FIXED', 'PERCENT');
export type CouponType = (typeof COUPON_TYPES)[number];

export const PRODUCT_SORTS = e('relevance', 'latest', 'price_asc', 'price_desc', 'popular', 'ending_soon');
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const ADMIN_ROLES: readonly Role[] = ['ADMIN', 'SUPER_ADMIN'];
export const SELLER_ROLES: readonly Role[] = ['SELLER', 'VERIFIED_SELLER', 'ADMIN', 'SUPER_ADMIN'];
