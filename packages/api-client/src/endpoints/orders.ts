import type {
  AddressDto,
  AddressInput,
  CartItemDto,
  ConfirmPaymentInput,
  CreateOrderInput,
  OrderDetailDto,
  OrderListQuery,
  OrderQuoteDto,
  OrderRowDto,
  Page,
  PaymentRequestDto,
  PreparePaymentInput,
  QuoteOrderInput,
  SettlementSummaryDto,
} from '@shop/shared';
import type { Http, Query } from '../http';

const id = (v: string) => encodeURIComponent(v);

export interface OrderCounts {
  pending: number;
  paid: number;
  shipping: number;
  delivered: number;
  refundRequested: number;
}
type OrderPage = Page<OrderRowDto> & { total: number };
type Ship = { carrier: string; trackingNumber: string };

export const ordersApi = (http: Http) => ({
  // 배송지
  addresses: () => http.get<AddressDto[]>('/me/addresses'),
  createAddress: (body: Partial<AddressInput>) => http.post<AddressDto>('/me/addresses', body),
  updateAddress: (addressId: string, body: Partial<AddressInput>) =>
    http.patch<AddressDto>(`/me/addresses/${id(addressId)}`, body),
  deleteAddress: (addressId: string) => http.delete<{ ok: true }>(`/me/addresses/${id(addressId)}`),

  // 장바구니
  cart: () => http.get<CartItemDto[]>('/cart'),
  putCart: (productId: string, quantity = 1) =>
    http.put<{ ok: true; count: number }>(`/cart/${id(productId)}`, { quantity }),
  removeCart: (productId: string) => http.delete<{ ok: true; count: number }>(`/cart/${id(productId)}`),
  clearCart: () => http.delete<{ ok: true; count: number }>('/cart'),

  // 주문
  quote: (body: Partial<QuoteOrderInput>) => http.post<OrderQuoteDto>('/orders/quote', body),
  create: (body: Partial<CreateOrderInput>) =>
    http.post<{ id: string; orderNumber: string; totalAmount: number }>('/orders', body),
  list: (q: Partial<OrderListQuery> = {}) => http.get<OrderPage>('/orders', q as Query),
  summary: () => http.get<OrderCounts>('/orders/summary'),
  detail: (orderId: string) => http.get<OrderDetailDto>(`/orders/${id(orderId)}`),
  cancel: (orderId: string, reason: string) =>
    http.post<OrderDetailDto>(`/orders/${id(orderId)}/cancel`, { reason }),
  confirm: (orderId: string) => http.post<OrderDetailDto>(`/orders/${id(orderId)}/confirm`),
  refundRequest: (orderId: string, reason: string) =>
    http.post<OrderDetailDto>(`/orders/${id(orderId)}/refund-request`, { reason }),

  // 결제
  preparePayment: (orderId: string, body: PreparePaymentInput) =>
    http.post<PaymentRequestDto>(`/orders/${id(orderId)}/payments`, body),
  confirmPayment: (body: ConfirmPaymentInput) => http.post<{ orderId: string }>('/payments/confirm', body),
  mockDeposit: (paymentId: string) =>
    http.post<{ orderId: string }>(`/payments/${id(paymentId)}/mock-deposit`),

  // 판매자
  sellerOrders: (q: Partial<OrderListQuery> = {}) => http.get<OrderPage>('/seller/orders', q as Query),
  sellerSummary: () => http.get<OrderCounts>('/seller/orders/summary'),
  prepare: (orderId: string) => http.post<OrderDetailDto>(`/orders/${id(orderId)}/prepare`),
  ship: (orderId: string, body: Ship) => http.post<OrderDetailDto>(`/orders/${id(orderId)}/ship`, body),
  updateShipment: (orderId: string, body: Ship) =>
    http.patch<OrderDetailDto>(`/orders/${id(orderId)}/shipment`, body),
  deliver: (orderId: string) => http.post<OrderDetailDto>(`/orders/${id(orderId)}/deliver`),
  refundApprove: (orderId: string) => http.post<OrderDetailDto>(`/orders/${id(orderId)}/refund`),
  refundReject: (orderId: string, reason: string) =>
    http.post<OrderDetailDto>(`/orders/${id(orderId)}/refund-reject`, { reason }),
  settlements: () => http.get<SettlementSummaryDto>('/seller/settlements'),
});
