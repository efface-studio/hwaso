'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { appReturnUrl, withParams } from '@/lib/app-bridge';

/** 결제창·본인인증 복귀 쿼리(성공 값 또는 code·message)를 그대로 앱으로 넘긴다 */
function Done() {
  const sp = useSearchParams();
  const ret = appReturnUrl(sp.get('return'));
  const params = Object.fromEntries([...sp.entries()].filter(([k]) => k !== 'return'));
  const target = ret ? withParams(ret, params) : null;

  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);

  if (!target)
    return (
      <p role="alert" className="text-body text-destructive">
        앱으로 돌아갈 수 없어요. 앱에서 주문 상태를 확인해주세요.
      </p>
    );
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-body">앱으로 돌아가는 중이에요…</p>
      <a href={target} className="text-small underline">
        앱으로 돌아가기
      </a>
    </div>
  );
}

export default function AppBridgeDonePage() {
  return (
    <main className="page-x mx-auto flex min-h-dvh max-w-md items-center justify-center">
      <Suspense>
        <Done />
      </Suspense>
    </main>
  );
}
