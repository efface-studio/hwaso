import type { CouponType, OrderStatus } from './enums';

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

/** 판매 수수료율 (상품 금액 기준, 배송비 제외). 쿠폰 할인은 플랫폼이 부담한다 */
export const PLATFORM_FEE_RATE = 0.08;
/** 즉시 구매 주문의 결제 기한 (분). 기한이 지나면 재고 예약이 풀린다 */
export const DIRECT_PAYMENT_DUE_MIN = 30;
/** 구매 확정 후 정산 예정일까지의 일수 */
export const SETTLEMENT_DELAY_DAYS = 2;
/** 발송 후 배송 완료 처리가 없을 때 자동으로 배송 완료로 보는 일수 */
export const AUTO_DELIVER_DAYS = 14;

/** 쿠폰 할인액 (상품 금액을 넘지 않는다). PERCENT 의 value 는 % */
export function couponDiscount(
  c: { type: CouponType; value: number; maxDiscount: number | null },
  itemsAmount: number,
): number {
  const raw = c.type === 'FIXED' ? c.value : Math.floor((itemsAmount * c.value) / 100);
  return Math.min(raw, c.maxDiscount ?? Infinity, itemsAmount);
}

export function settlementAmounts(itemsAmount: number, shippingFee: number) {
  const fee = Math.round(itemsAmount * PLATFORM_FEE_RATE);
  const gross = itemsAmount + shippingFee;
  return { gross, fee, net: gross - fee };
}

/** 택배사와 배송 조회 주소. url 이 없으면 조회 링크 없이 표시만 한다 */
export const CARRIERS = [
  { name: 'CJ대한통운', url: 'https://trace.cjlogistics.com/next/tracking.html?wblNo=' },
  {
    name: '우체국택배',
    url: 'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=',
  },
  {
    name: '한진택배',
    url: 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=',
  },
  { name: '롯데택배', url: 'https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=' },
  { name: '로젠택배', url: 'https://www.ilogen.com/web/personal/trace/' },
  { name: '미술품 전문 운송', url: null },
  { name: '직접 전달', url: null },
] as const;

export function trackingUrl(carrier: string, trackingNumber: string | null): string | null {
  const c = CARRIERS.find((x) => x.name === carrier);
  return c?.url && trackingNumber ? c.url + encodeURIComponent(trackingNumber) : null;
}
