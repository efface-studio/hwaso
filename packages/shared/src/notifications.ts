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

export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory | 'system'> = {
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
};

export interface NotificationPrefs {
  push: Record<NotificationCategory, boolean>;
  /** 방해 금지: 21시~다음 날 8시(한국 시간)에는 푸시를 보내지 않는다 (알림함에는 쌓인다) */
  quietHours: boolean;
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
});

/** 저장된 값(JSON)을 기본값과 합쳐 항상 완전한 설정으로 만든다 */
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
