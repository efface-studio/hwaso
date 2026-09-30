import type { IdentityStatusDto, PaymentMethod } from '@shop/shared';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import i18n from '@/i18n';
import { api } from './api';
import { env } from './env';

export class BridgeCancelled extends Error {}

/**
 * 웹 브리지 페이지(토스 결제창·카카오 우편번호)를 인앱 브라우저로 열고, 앱 딥링크로 돌아온 쿼리를 받는다.
 * iOS 는 ASWebAuthenticationSession, Android 는 Custom Tabs — 카드사 앱 전환도 브라우저가 처리한다.
 */
async function openBridge(path: string, params: Record<string, string> = {}): Promise<URLSearchParams> {
  const ret = Linking.createURL('bridge');
  const url = `${env.webUrl}/app-bridge/${path}?${new URLSearchParams({ ...params, return: ret })}`;
  const r = await WebBrowser.openAuthSessionAsync(url, ret);
  if (r.type !== 'success') throw new BridgeCancelled();
  return new URL(r.url).searchParams;
}

const CANCEL_CODES = new Set(['USER_CANCEL', 'PAY_PROCESS_CANCELED']);

/**
 * 결제: 서버가 결제를 준비(금액·배송지 확정) → 결제창 → 서버가 금액을 대조해 승인.
 * 키가 없는 개발 환경(mock)은 결제창 없이 바로 승인한다. 사용자가 닫으면 BridgeCancelled.
 */
export async function payOrder(orderId: string, method: PaymentMethod, addressId?: string): Promise<void> {
  const req = await api.orders.preparePayment(orderId, { method, addressId });
  if (req.provider === 'mock') {
    await api.orders.confirmPayment({
      paymentId: req.paymentId,
      paymentKey: `mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      amount: req.amount,
    });
    return;
  }
  const p = await openBridge('pay', { r: JSON.stringify(req) });
  const code = p.get('code');
  if (code) {
    if (CANCEL_CODES.has(code)) throw new BridgeCancelled();
    throw new Error(p.get('message') || i18n.t('common:bridge.paymentFailed'));
  }
  await api.orders.confirmPayment({
    paymentId: p.get('orderId') ?? '',
    paymentKey: p.get('paymentKey') ?? '',
    amount: Number(p.get('amount')),
  });
}

/**
 * PASS 본인인증: 서버가 인증 ID 를 준비 → 포트원 인증창 → 서버가 포트원에 결과를 다시 조회해 확정한다.
 * 창을 닫으면 BridgeCancelled.
 */
export async function verifyIdentity(): Promise<IdentityStatusDto> {
  const prep = await api.auth.prepareIdentity();
  const p = await openBridge('identity', {
    storeId: prep.storeId,
    channelKey: prep.channelKey,
    id: prep.identityVerificationId,
  });
  if (p.get('code')) {
    const message = p.get('message');
    if (!message) throw new BridgeCancelled();
    throw new Error(message);
  }
  return api.auth.completeIdentity(p.get('identityVerificationId') ?? prep.identityVerificationId);
}

/** 우편번호 검색 → { zipCode, address1 } (닫으면 null). 검색 화면은 앱 테마(theme)로 그린다 */
export async function searchPostcode(
  theme: 'light' | 'dark',
): Promise<{ zipCode: string; address1: string } | null> {
  try {
    const p = await openBridge('postcode', { theme });
    const zipCode = p.get('zipCode');
    const address1 = p.get('address1');
    return zipCode && address1 ? { zipCode, address1 } : null;
  } catch (e) {
    if (e instanceof BridgeCancelled) return null;
    throw e;
  }
}
