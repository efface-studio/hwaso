import type { PaymentRequestDto } from '@shop/shared';

const clampHours = (dueAt: string | null) =>
  dueAt ? Math.min(720, Math.max(1, Math.floor((Date.parse(dueAt) - Date.now()) / 3_600_000))) : 24;

/**
 * 결제창 열기. 성공·실패 시 토스페이먼츠가 /checkout/success · /checkout/fail 로 이동시키며,
 * 최종 승인은 서버(/payments/confirm)가 금액을 대조한 뒤 한다. 키가 없는 개발 환경은 모의 결제로 바로 이동한다.
 */
export async function startPayment(
  req: PaymentRequestDto,
  {
    successUrl = `${window.location.origin}/checkout/success`,
    failUrl = `${window.location.origin}/checkout/fail`,
  }: { successUrl?: string; failUrl?: string } = {},
) {
  if (req.provider === 'mock') {
    const q = new URLSearchParams({
      paymentKey: `mock_${crypto.randomUUID()}`,
      orderId: req.paymentId,
      amount: String(req.amount),
    });
    window.location.assign(`${successUrl}?${q}`);
    return;
  }
  const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
  const toss = await loadTossPayments(req.clientKey!);
  const payment = toss.payment({ customerKey: req.customerKey });
  const common = {
    amount: { currency: 'KRW' as const, value: req.amount },
    orderId: req.paymentId,
    orderName: req.orderName,
    successUrl,
    failUrl,
    customerEmail: req.customerEmail ?? undefined,
    customerName: req.customerName,
  };
  const card = { useEscrow: false, useCardPoint: false, useAppCardOnly: false };
  switch (req.method) {
    case 'EASY_PAY':
      return payment.requestPayment({
        ...common,
        method: 'CARD',
        card: { ...card, flowMode: 'DIRECT', easyPay: 'TOSSPAY' },
      });
    case 'BANK_TRANSFER':
      return payment.requestPayment({
        ...common,
        method: 'TRANSFER',
        transfer: { cashReceipt: { type: '소득공제' }, useEscrow: false },
      });
    case 'VIRTUAL_ACCOUNT':
      return payment.requestPayment({
        ...common,
        method: 'VIRTUAL_ACCOUNT',
        virtualAccount: {
          cashReceipt: { type: '소득공제' },
          useEscrow: false,
          validHours: clampHours(req.dueAt),
        },
      });
    default:
      return payment.requestPayment({ ...common, method: 'CARD', card: { ...card, flowMode: 'DEFAULT' } });
  }
}

/** 결제창을 사용자가 닫은 경우는 오류로 보여주지 않는다 */
export const isUserCancel = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'USER_CANCEL';
