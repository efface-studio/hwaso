import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/app-exception';
import { env, isProd } from '../config/env';

/** 토스페이먼츠 결제 객체 중 사용하는 필드 (https://docs.tosspayments.com/reference#payment-객체) */
export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status:
    | 'READY'
    | 'IN_PROGRESS'
    | 'WAITING_FOR_DEPOSIT'
    | 'DONE'
    | 'CANCELED'
    | 'PARTIAL_CANCELED'
    | 'ABORTED'
    | 'EXPIRED';
  totalAmount: number;
  balanceAmount: number;
  approvedAt: string | null;
  virtualAccount?: { accountNumber: string; bankCode: string; customerName: string; dueDate: string } | null;
  receipt?: { url: string } | null;
}

const BASE = 'https://api.tosspayments.com/v1/payments';

/**
 * 토스페이먼츠 API. 키(TOSS_SECRET_KEY·TOSS_CLIENT_KEY)만 넣으면 동작한다.
 * 모든 쓰기 요청에 Idempotency-Key 를 붙여 네트워크 재시도에도 한 번만 처리되게 한다.
 */
@Injectable()
export class TossClient {
  private readonly logger = new Logger(TossClient.name);

  enabled(): boolean {
    return !!(env().TOSS_SECRET_KEY && env().TOSS_CLIENT_KEY);
  }

  clientKey(): string | null {
    return env().TOSS_CLIENT_KEY ?? null;
  }

  confirm(paymentKey: string, orderId: string, amount: number, idempotencyKey: string) {
    return this.call('POST', `${BASE}/confirm`, { paymentKey, orderId, amount }, idempotencyKey);
  }

  get(paymentKey: string) {
    return this.call('GET', `${BASE}/${encodeURIComponent(paymentKey)}`);
  }

  cancel(paymentKey: string, reason: string, idempotencyKey: string) {
    return this.call(
      'POST',
      `${BASE}/${encodeURIComponent(paymentKey)}/cancel`,
      { cancelReason: reason.slice(0, 200) },
      idempotencyKey,
    );
  }

  private async call(method: string, url: string, body?: object, idempotencyKey?: string) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${env().TOSS_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as TossPayment & { code?: string; message?: string };
    if (!res.ok) {
      this.logger.warn({ status: res.status, code: json.code }, 'toss api error');
      throw new AppException('PAYMENT_FAILED', json.message ?? undefined, { providerCode: json.code }, 400);
    }
    return json as TossPayment;
  }
}

/** 키가 없는 개발 환경용 모의 결제. 운영에서는 절대 쓰지 않는다 */
export const mockPaymentsAllowed = () => !isProd();

export function mockPayment(
  orderId: string,
  paymentKey: string,
  amount: number,
  virtualAccount: boolean,
): TossPayment {
  return {
    paymentKey,
    orderId,
    status: virtualAccount ? 'WAITING_FOR_DEPOSIT' : 'DONE',
    totalAmount: amount,
    balanceAmount: amount,
    approvedAt: virtualAccount ? null : new Date().toISOString(),
    virtualAccount: virtualAccount
      ? {
          accountNumber: '00012345678901',
          bankCode: '88',
          customerName: '화소',
          dueDate: new Date(Date.now() + 86_400_000).toISOString(),
        }
      : null,
    receipt: null,
  };
}

/** 토스페이먼츠 은행 코드 → 이름 (가상계좌 안내용) */
export const BANK_NAMES: Record<string, string> = {
  '02': '산업은행',
  '03': 'IBK기업은행',
  '04': 'KB국민은행',
  '07': '수협은행',
  '11': 'NH농협은행',
  '20': '우리은행',
  '23': 'SC제일은행',
  '31': '대구은행',
  '32': '부산은행',
  '34': '광주은행',
  '35': '제주은행',
  '37': '전북은행',
  '39': '경남은행',
  '45': '새마을금고',
  '48': '신협',
  '71': '우체국',
  '81': '하나은행',
  '88': '신한은행',
  '89': '케이뱅크',
  '90': '카카오뱅크',
  '92': '토스뱅크',
};
