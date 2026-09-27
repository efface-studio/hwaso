'use client';

import { ApiError } from '@shop/api-client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/** 결제창 성공 복귀: 서버가 금액을 대조해 승인한 뒤 주문 상세로 이동 */
function Confirm() {
  const sp = useSearchParams();
  const router = useRouter();
  const ready = useAuthStore((s) => s.ready);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const paymentId = sp.get('orderId') ?? '';
    const paymentKey = sp.get('paymentKey') ?? '';
    const amount = Number(sp.get('amount'));
    api.orders
      .confirmPayment({ paymentId, paymentKey, amount })
      .then(({ orderId }) => router.replace(`/orders/${orderId}?paid=1`))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : '결제를 확인하지 못했습니다.'));
  }, [ready, sp, router]);

  if (error)
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="destructive" title="결제를 완료하지 못했어요">
          {error} 결제가 되었는데 이 화면이 보이면 고객센터로 문의해주세요.
        </Alert>
        <Button asChild variant="outline">
          <Link href="/my/purchases">구매 내역 보기</Link>
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-3 py-16" role="status">
      <Spinner className="size-6 text-muted" />
      <p className="text-body">결제를 확인하고 있어요. 창을 닫지 마세요.</p>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <div className="page-x mx-auto max-w-md py-10">
      <Suspense>
        <Confirm />
      </Suspense>
    </div>
  );
}
