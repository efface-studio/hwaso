import {
  ADMIN_ROLES,
  type CategoryGroup,
  type MeDto,
  type PaymentStatus,
  type ReportAction,
  type ReportTarget,
  type Role,
  type UserStatus,
} from '@shop/shared';

/** 관리자 화면에서만 쓰는 라벨 (웹 관리자 components/admin 과 같은 표기) */
export const ROLE_LABEL: Record<Role, string> = {
  USER: '일반',
  SELLER: '판매자',
  VERIFIED_SELLER: '인증 판매자',
  ADMIN: '관리자',
  SUPER_ADMIN: '최고 관리자',
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: '정상',
  SUSPENDED: '정지',
  DELETED: '탈퇴',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  READY: '대기',
  DONE: '완료',
  CANCELLED: '취소',
  PARTIAL_REFUNDED: '부분 환불',
  REFUNDED: '환불',
  FAILED: '실패',
};

export const CATEGORY_GROUP_LABEL: Record<CategoryGroup, string> = {
  ART: '미술',
  HISTORICAL: '고미술·역사',
  COLLECTIBLES: '컬렉터블',
};

export const REPORT_ACTION_LABEL: Record<ReportAction, string> = {
  none: '조치 없음',
  hide_product: '작품 운영 비공개',
  suspend_user: '작성자·판매자 이용 정지',
  delete_message: '메시지 삭제',
  delete_review: '후기 삭제',
};

/** 신고 대상별로 고를 수 있는 조치 */
export const REPORT_ACTIONS_BY_TARGET: Record<ReportTarget, ReportAction[]> = {
  PRODUCT: ['none', 'hide_product', 'suspend_user'],
  USER: ['none', 'suspend_user'],
  REVIEW: ['none', 'delete_review', 'suspend_user'],
  MESSAGE: ['none', 'delete_message', 'suspend_user'],
};

export const AUDIT_TARGETS = [
  'USER',
  'PRODUCT',
  'ORDER',
  'AUCTION',
  'SETTLEMENT',
  'COUPON',
  'REPORT',
  'CATEGORY',
  'BANNER',
  'NOTICE',
  'NOTIFICATION',
  'AUCTION_POLICY',
  'MESSAGE',
  'REVIEW',
  'SERVER_LOG',
] as const;

export const isAdmin = (user: Pick<MeDto, 'role'> | null | undefined) =>
  !!user && ADMIN_ROLES.includes(user.role);

/** 관리자 목록의 날짜·시각 (26. 9. 29. 오후 3:20) */
export function dt(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** 정지 기간 표시: "26. 10. 8. 오후 3:00까지 · 3일 남음" 또는 "영구" (지났으면 다음 로그인 때 풀린다) */
export function suspensionText(until: string | null): string {
  if (!until) return '영구';
  const ms = Date.parse(until) - Date.now();
  if (ms <= 0) return `${dt(until)} 종료 · 다음 로그인 때 해제`;
  const left =
    ms < 86_400_000 ? `${Math.max(1, Math.ceil(ms / 3_600_000))}시간` : `${Math.ceil(ms / 86_400_000)}일`;
  return `${dt(until)}까지 · ${left} 남음`;
}
