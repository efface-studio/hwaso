import type { OrderStatus } from './enums';

/** 주문 상태 전이표 (일반 구매와 경매 낙찰 공통). 서버가 모든 전이 전에 검사한다. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'REFUND_REQUESTED'],
  REFUND_REQUESTED: ['REFUNDED', 'DELIVERED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** 결제 이후 취소 시 환불이 필요한 상태 */
export const REFUNDABLE_CANCEL_STATUSES: readonly OrderStatus[] = ['PAID', 'PREPARING'];

/** 배송 완료 후 자동 구매 확정까지의 일수 */
export const AUTO_CONFIRM_DAYS = 7;
