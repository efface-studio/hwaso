import type {
  AuctionStatus,
  AuthProvider,
  ItemCondition,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  ProductSort,
  ProductStatus,
  ProvenanceKind,
  ReportReason,
  ReportStatus,
  ReportTarget,
  SettlementStatus,
  SaleType,
  VerificationStatus,
} from './enums';

export const SALE_TYPE_LABEL: Record<SaleType, string> = {
  FIXED: '즉시 구매',
  AUCTION: '경매',
  RESERVATION: '예약 판매',
};

export const CONDITION_LABEL: Record<ItemCondition, string> = {
  MINT: '최상 (미사용급)',
  EXCELLENT: '매우 좋음',
  GOOD: '좋음',
  FAIR: '보통 (사용감 있음)',
  POOR: '손상 있음',
};

export const AUCTION_STATUS_LABEL: Record<AuctionStatus, string> = {
  DRAFT: '작성 중',
  SCHEDULED: '시작 예정',
  LIVE: '진행 중',
  ENDED: '종료',
  SETTLED: '거래 완료',
  CANCELLED: '취소됨',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: '주문 접수',
  PAYMENT_PENDING: '결제 대기',
  PAID: '결제 완료',
  PREPARING: '배송 준비 중',
  SHIPPED: '배송 중',
  DELIVERED: '배송 완료',
  COMPLETED: '구매 확정',
  CANCELLED: '취소됨',
  REFUND_REQUESTED: '환불 요청',
  REFUNDED: '환불 완료',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: '신용·체크카드',
  EASY_PAY: '간편결제',
  BANK_TRANSFER: '계좌이체',
  VIRTUAL_ACCOUNT: '무통장입금(가상계좌)',
};

/** 플랫폼이 확인하지 않은 정보를 인증된 사실처럼 표기하지 않는다 (docs/DESIGN_SYSTEM.md §9) */
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  UNVERIFIED: '판매자 제공 정보',
  PENDING: '검수 중',
  VERIFIED: '플랫폼 검수 완료',
  REJECTED: '검수 반려',
};

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  FRAUD: '사기',
  FAKE_ITEM: '허위 상품',
  COUNTERFEIT: '가품 의심',
  COPYRIGHT: '저작권 침해',
  INAPPROPRIATE: '부적절한 콘텐츠',
  OTHER: '기타',
};

export const SORT_LABEL: Record<ProductSort, string> = {
  relevance: '관련도순',
  latest: '최신순',
  price_asc: '낮은 가격순',
  price_desc: '높은 가격순',
  popular: '인기순',
  ending_soon: '마감 임박순',
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  BID_PLACED: '입찰 성공',
  OUTBID: '더 높은 입찰',
  AUCTION_ENDING: '경매 종료 임박',
  AUCTION_WON: '낙찰',
  AUCTION_LOST: '패찰',
  AUCTION_STARTED: '경매 시작',
  ITEM_SOLD: '판매 완료',
  PAYMENT_DONE: '결제 완료',
  SHIPPED: '배송 시작',
  DELIVERED: '배송 완료',
  INQUIRY_ANSWERED: '문의 답변',
  PRICE_CHANGED: '가격 변경',
  FOLLOWED: '팔로우',
  FAVORITE_ON_SALE: '관심상품 판매 시작',
  CHAT_MESSAGE: '새 메시지',
  INQUIRY_RECEIVED: '새 문의',
  REVIEW_RECEIVED: '새 후기',
  ORDER_UPDATED: '주문',
  FOLLOWING_NEW_ITEM: '팔로우 새 작품',
  WELCOME: '가입 축하',
  SYSTEM: '알림',
  SECURITY_NEW_DEVICE: '새 기기 로그인',
};

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: '임시 저장',
  PENDING_REVIEW: '검수 중',
  ACTIVE: '판매 중',
  RESERVED: '거래 중',
  SOLD: '판매 완료',
  SUSPENDED: '운영 정지',
  HIDDEN: '판매 중지',
};

export const PROVENANCE_KIND_LABEL: Record<ProvenanceKind, string> = {
  OWNERSHIP: '소장',
  EXHIBITION: '전시',
  PUBLICATION: '출판',
};

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  PENDING: '정산 대기',
  SCHEDULED: '지급 예정',
  PAID: '지급 완료',
  HELD: '보류',
};

export const AUTH_PROVIDER_LABEL: Record<AuthProvider, string> = {
  KAKAO: '카카오',
  NAVER: '네이버',
  GOOGLE: 'Google',
  APPLE: 'Apple',
};

export const REPORT_TARGET_LABEL: Record<ReportTarget, string> = {
  PRODUCT: '작품',
  USER: '사용자',
  REVIEW: '후기',
  MESSAGE: '메시지',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: '접수',
  IN_REVIEW: '확인 중',
  RESOLVED: '조치 완료',
  REJECTED: '반려',
};
