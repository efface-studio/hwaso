'use client';

import type { PaymentRequestDto } from '@shop/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { appReturnUrl, withParams } from '@/lib/app-bridge';
import { isUserCancel, startPayment } from '@/lib/payments';

function parse(raw: string | null): PaymentRequestDto | null {
  try {
    const r = JSON.parse(raw ?? '') as PaymentRequestDto;
    const ok =
      typeof r.paymentId === 'string' &&
      typeof r.clientKey === 'string' &&
      typeof r.customerKey === 'string' &&
      typeof r.orderName === 'string' &&
      Number.isInteger(r.amount) &&
      r.amount > 0;
    return ok ? r : null;
  } catch {
    return null;
  }
}

/**
 * 앱 결제 브리지: 앱이 준비한 결제 요청(r)으로 토스 결제창을 열고, 결과는 done 페이지가 앱으로 돌려보낸다.
 * 승인(금액 대조)은 앱이 서버에 요청한다 — 이 페이지는 결제창만 띄운다.
 */
function Bridge() {
  const sp = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const ret = appReturnUrl(sp.get('return'));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const req = parse(sp.get('r'));
    if (!ret || !req) {
      setError('잘못된 결제 요청이에요. 앱에서 다시 시도해주세요.');
      return;
    }
    const done = `${window.location.origin}/app-bridge/done?${new URLSearchParams({ return: ret })}`;
    startPayment(req, { successUrl: done, failUrl: done }).catch((e: unknown) => {
      const code = isUserCancel(e) ? 'USER_CANCEL' : ((e as { code?: string }).code ?? 'PAY_ERROR');
      window.location.replace(withParams(ret, { code, message: (e as Error).message ?? '' }));
    });
  }, [sp, ret]);

  if (error)
    return (
      <p role="alert" className="text-body text-destructive">
        {error}
      </p>
    );
  return (
    <div className="flex flex-col items-center gap-3" role="status">
      <Spinner className="size-6 text-muted" />
      <p className="text-body">결제창을 여는 중이에요…</p>
    </div>
  );
}

export default function AppPayBridgePage() {
  return (
    <main className="page-x mx-auto flex min-h-dvh max-w-md items-center justify-center">
      <Suspense>
        <Bridge />
      </Suspense>
    </main>
  );
}
