import './zod-config';
import * as z from 'zod';
import type { NotificationType } from './enums';

/** 알림 설정 단위. system(운영 공지·계정 보안)은 끌 수 없다 */
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
  SYSTEM: 'system',
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

export const pushTokenSchema = z.strictObject({
  /** apns: iOS 기기 토큰(hex) / fcm: Android 기기 토큰 / expo: ExponentPushToken[…] / web: PushSubscription JSON */
  token: z.string().min(10).max(2000),
  platform: z.enum(['apns', 'fcm', 'expo', 'web']),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;
