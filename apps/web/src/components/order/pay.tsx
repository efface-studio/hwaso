'use client';

import { ApiError } from '@shop/api-client';
import type { PaymentMethod } from '@shop/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RadioGroup } from '@/components/ui/choice';
import { api } from '@/lib/api';
import { isUserCancel, startPayment } from '@/lib/payments';
import { toast } from '@/stores/toast';

const METHODS: { value: PaymentMethod; label: string; description?: string }[] = [
  { value: 'CARD', label: '신용·체크카드', description: '할부·카드사 간편결제 포함' },
  { value: 'EASY_PAY', label: '토스페이' },
  { value: 'BANK_TRANSFER', label: '계좌이체', description: '실시간 계좌이체' },
  {
    value: 'VIRTUAL_ACCOUNT',
    label: '무통장입금 (가상계좌)',
    description: '고액 작품에 적합해요. 입금 기한 안에 입금하면 결제가 완료돼요.',
  },
];

export function PayMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}) {
  return <RadioGroup aria-label="결제 수단" value={value} onValueChange={onChange} options={METHODS} />;
}

/**
 * 결제 시작: 서버에 결제를 준비(금액·배송지 확정)하고 결제창을 연다.
 * 결제창을 닫으면 주문 상세로 보내 기한 안에 다시 결제할 수 있게 한다.
 */
export function usePay() {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const pay = async (orderId: string, method: PaymentMethod, addressId?: string) => {
    setPaying(true);
    try {
      const req = await api.orders.preparePayment(orderId, { method, addressId });
      await startPayment(req);
    } catch (e) {
      if (isUserCancel(e)) {
        toast.show('결제를 취소했어요. 결제 기한 안에 다시 결제할 수 있어요.');
      } else {
        toast.error(
          e instanceof ApiError ? e.message : ((e as Error).message ?? '결제를 시작하지 못했습니다.'),
        );
      }
      router.replace(`/orders/${orderId}`);
      setPaying(false);
    }
  };
  return { pay, paying };
}
