import './zod-config';
import * as z from 'zod';
import type { NotificationType } from './enums';

/** 알림 설정 단위. system(운영 공지·계정 보안·가입 축하)은 끌 수 없다 */
export const NOTIFICATION_CATEGORIES = ['auction', 'trade', 'chat', 'activity'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABEL: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  auction: { label: '경매', description: '상위 입찰, 종료 임박, 낙찰·유찰, 관심 경매 시작' },
  trade: { label: '주문·배송', description: '결제, 발송, 배송 완료, 취소·환불' },
  chat: { label: '채팅', description: '새 메시지' },
  activity: {
    label: '활동',
    description: '문의·답변, 후기, 팔로우, 관심 작품 가격 인하, 팔로우한 판매자의 새 작품',
  },
};

// ───── 관리자 알림 ─────

/** 관리자 알림 종류 (설정 키). 관리자(ADMIN·SUPER_ADMIN)에게만 보내고 설정도 관리자에게만 보인다 */
export const ADMIN_NOTIFICATION_KINDS = ['report', 'seller', 'certificate', 'payment', 'appUpdate'] as const;
export type AdminNotificationKind = (typeof ADMIN_NOTIFICATION_KINDS)[number];

export const ADMIN_NOTIFICATION_TYPE: Record<AdminNotificationKind, NotificationType> = {
  report: 'ADMIN_REPORT',
  seller: 'ADMIN_SELLER_PENDING',
  certificate: 'ADMIN_CERTIFICATE_PENDING',
  payment: 'ADMIN_PAYMENT_ISSUE',
  appUpdate: 'ADMIN_APP_UPDATE',
};

export const ADMIN_NOTIFICATION_LABEL: Record<AdminNotificationKind, { label: string; description: string }> =
  {
    report: { label: '신고 접수', description: '작품·회원·후기·메시지 신고' },
    seller: { label: '판매자 인증 신청', description: '새 판매자 등록 (인증 대기)' },
    certificate: { label: '감정서 검수 요청', description: '작품 감정서 등록·변경' },
    payment: { label: '결제 이상', description: '금액 불일치, 취소된 주문의 자동 환불, 환불 실패' },
    appUpdate: { label: '앱 업데이트', description: 'OTA 업데이트 배포·되돌리기' },
  };

/**
 * 관리자 알림 링크(웹 관리자 경로) → 앱 관리자 화면 경로.
 * 웹에는 OTA 화면이 없어 앱 업데이트 알림은 웹 대시보드(`/admin#updates`)로 열린다
 */
export const ADMIN_LINKS = {
  report: { web: '/admin/reports', app: '/admin/ops/reports' },
  seller: { web: '/admin/sellers', app: '/admin/members?tab=sellers' },
  certificate: {
    web: '/admin/products?verification=PENDING',
    app: '/admin/catalog?tab=products&verification=PENDING',
  },
  payment: { web: '/admin/payments', app: '/admin/commerce?tab=payments' },
  appUpdate: { web: '/admin#updates', app: '/admin/ops/updates' },
} as const satisfies Record<AdminNotificationKind, { web: string; app: string }>;

const ADMIN_APP_PATH = new Map<string, string>(Object.values(ADMIN_LINKS).map((l) => [l.web, l.app]));

/** 알림 링크를 앱 경로로 — 관리자 알림 링크만 바꾸고 나머지는 그대로 둔다 */
export const toAppPath = (link: string): string => ADMIN_APP_PATH.get(link) ?? link;

export interface AdminNotificationPrefs {
  /** 관리자 알림 전체 (끄면 알림함·푸시 모두 보내지 않는다) */
  enabled: boolean;
  types: Record<AdminNotificationKind, boolean>;
}

export const DEFAULT_ADMIN_NOTIFICATION_PREFS: AdminNotificationPrefs = {
  enabled: true,
  types: { report: true, seller: true, certificate: true, payment: true, appUpdate: true },
};

export const adminNotificationPrefsSchema = z.strictObject({
  enabled: z.boolean(),
  types: z.strictObject({
    report: z.boolean(),
    seller: z.boolean(),
    certificate: z.boolean(),
    payment: z.boolean(),
    appUpdate: z.boolean(),
  }),
});

/** 저장된 관리자 설정(JSON)을 기본값(모두 켜짐)과 합친다 */
export function resolveAdminNotificationPrefs(raw: unknown): AdminNotificationPrefs {
  const r = (raw ?? {}) as Partial<AdminNotificationPrefs>;
  return {
    enabled: r.enabled ?? DEFAULT_ADMIN_NOTIFICATION_PREFS.enabled,
    types: { ...DEFAULT_ADMIN_NOTIFICATION_PREFS.types, ...(r.types ?? {}) },
  };
}

export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory | 'system' | 'admin'> = {
  BID_PLACED: 'auction',
  OUTBID: 'auction',
  AUCTION_ENDING: 'auction',
  AUCTION_WON: 'auction',
  AUCTION_LOST: 'auction',
  AUCTION_STARTED: 'auction',
  ITEM_SOLD: 'trade',
  PAYMENT_DONE: 'trade',
  SHIPPED: 'trade',
  DELIVERED: 'trade',
  ORDER_UPDATED: 'trade',
  CHAT_MESSAGE: 'chat',
  INQUIRY_ANSWERED: 'activity',
  INQUIRY_RECEIVED: 'activity',
  REVIEW_RECEIVED: 'activity',
  PRICE_CHANGED: 'activity',
  FOLLOWED: 'activity',
  FAVORITE_ON_SALE: 'activity',
  FOLLOWING_NEW_ITEM: 'activity',
  WELCOME: 'system',
  SYSTEM: 'system',
  SECURITY_NEW_DEVICE: 'system',
  ADMIN_REPORT: 'admin',
  ADMIN_SELLER_PENDING: 'admin',
  ADMIN_CERTIFICATE_PENDING: 'admin',
  ADMIN_PAYMENT_ISSUE: 'admin',
  ADMIN_APP_UPDATE: 'admin',
};

export interface NotificationPrefs {
  push: Record<NotificationCategory, boolean>;
  /** 방해 금지: 21시~다음 날 8시(한국 시간)에는 푸시를 보내지 않는다 (알림함에는 쌓인다) */
  quietHours: boolean;
  /** 관리자 알림 — 관리자에게만 응답에 들어가고, 관리자가 아니면 저장하지 않는다 */
  admin?: AdminNotificationPrefs;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: { auction: true, trade: true, chat: true, activity: true },
  quietHours: false,
};

export const notificationPrefsSchema = z.strictObject({
  push: z.strictObject({
    auction: z.boolean(),
    trade: z.boolean(),
    chat: z.boolean(),
    activity: z.boolean(),
  }),
  quietHours: z.boolean(),
  admin: adminNotificationPrefsSchema.optional(),
});

/** 저장된 값(JSON)을 기본값과 합쳐 항상 완전한 설정으로 만든다 (관리자 설정은 resolveAdminNotificationPrefs) */
export function resolveNotificationPrefs(raw: unknown): NotificationPrefs {
  const r = (raw ?? {}) as Partial<NotificationPrefs>;
  return {
    push: { ...DEFAULT_NOTIFICATION_PREFS.push, ...(r.push ?? {}) },
    quietHours: r.quietHours ?? DEFAULT_NOTIFICATION_PREFS.quietHours,
  };
}

export const QUIET_HOURS = { start: 21, end: 8 } as const;

export function inQuietHours(now = new Date()): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24;
  return kstHour >= QUIET_HOURS.start || kstHour < QUIET_HOURS.end;
}

export const notificationReadSchema = z.union([
  z.strictObject({ ids: z.array(z.string().min(1).max(40)).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);

/**
 * 웹 푸시 endpoint 허용 호스트 — 브라우저 푸시 서비스만. 서버가 이 주소로 직접 POST 하므로
 * 임의 주소를 받으면 내부망 요청(SSRF)·제3자 대상 증폭에 쓰일 수 있다 (docs/SECURITY.md)
 */
const WEB_PUSH_HOSTS =
  /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

export function isAllowedWebPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string') return false;
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === 'https:' && !u.port && !u.username && !u.password && WEB_PUSH_HOSTS.test(u.hostname)
    );
  } catch {
    return false;
  }
}

/** PushSubscription JSON: 허용된 endpoint + 암호화 키 */
const isWebSubscription = (token: string) => {
  try {
    const s = JSON.parse(token) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    return (
      isAllowedWebPushEndpoint(s.endpoint) &&
      typeof s.keys?.p256dh === 'string' &&
      typeof s.keys.auth === 'string'
    );
  } catch {
    return false;
  }
};

export const pushTokenSchema = z
  .strictObject({
    /** apns: iOS 기기 토큰(hex) / fcm: Android 기기 토큰 / expo: ExponentPushToken[…] / web: PushSubscription JSON */
    token: z.string().min(10).max(2000),
    platform: z.enum(['apns', 'fcm', 'expo', 'web']),
  })
  .refine((v) => v.platform !== 'web' || isWebSubscription(v.token), {
    message: '지원하지 않는 푸시 구독입니다.',
    path: ['token'],
  })
  // APNs 기기 토큰은 hex — 요청 경로(/3/device/{token})에 그대로 들어간다
  .refine((v) => v.platform !== 'apns' || /^[0-9a-f]{64,200}$/i.test(v.token), {
    message: '올바르지 않은 기기 토큰입니다.',
    path: ['token'],
  });
export type PushTokenInput = z.infer<typeof pushTokenSchema>;
