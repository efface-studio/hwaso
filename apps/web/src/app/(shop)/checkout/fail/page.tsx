'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';

function Fail() {
  const sp = useSearchParams();
  const cancelled = sp.get('code') === 'PAY_PROCESS_CANCELED' || sp.get('code') === 'USER_CANCEL';
  return (
    <div className="flex flex-col gap-4">
      <Alert
        tone={cancelled ? 'info' : 'destructive'}
        title={cancelled ? '결제를 취소했어요' : '결제에 실패했어요'}
      >
        {cancelled
          ? '결제 기한 안에 구매 내역에서 다시 결제할 수 있어요.'
          : (sp.get('message') ?? '잠시 후 다시 시도해주세요.')}
      </Alert>
      <Button asChild>
        <Link href="/my/purchases?filter=pending">결제 대기 주문 보기</Link>
      </Button>
    </div>
  );
}

export default function CheckoutFailPage() {
  return (
    <div className="page-x mx-auto max-w-md py-10">
      <Suspense>
        <Fail />
      </Suspense>
    </div>
  );
}
