import i18n from './index';
import type ko from './locales/ko/labels';

type Labels = typeof ko;
type Group = Exclude<keyof Labels, 'notificationCategory'>;

/**
 * 상태·종류 라벨을 지금 언어로 (@shop/shared 의 *_LABEL 대신 쓴다).
 * 예: label('orderStatus', order.status) → "배송 중" / "Shipped"
 */
export function label<G extends Group>(group: G, value: keyof Labels[G] & string): string {
  return i18n.t(`labels:${group}.${value}` as never);
}

/** 알림 종류 묶음 (이름 + 설명) */
export function notificationCategoryLabel(category: keyof Labels['notificationCategory']) {
  return {
    label: i18n.t(`labels:notificationCategory.${category}.label` as never) as string,
    description: i18n.t(`labels:notificationCategory.${category}.description` as never) as string,
  };
}
