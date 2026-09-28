'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import { PostcodeSearch } from '@/components/order/postcode';
import { appReturnUrl, withParams } from '@/lib/app-bridge';

/** 앱 우편번호 브리지: 카카오 우편번호로 주소를 고르면 우편번호·주소를 앱으로 돌려보낸다 */
function Bridge() {
  const sp = useSearchParams();
  const ret = appReturnUrl(sp.get('return'));
  const onSelect = useCallback(
    (zipCode: string, address1: string) => {
      if (ret) window.location.replace(withParams(ret, { zipCode, address1 }));
    },
    [ret],
  );
  if (!ret)
    return (
      <p role="alert" className="text-body text-destructive">
        잘못된 요청이에요. 앱에서 다시 시도해주세요.
      </p>
    );
  return <PostcodeSearch onSelect={onSelect} />;
}

export default function AppPostcodeBridgePage() {
  return (
    <main className="flex min-h-dvh flex-col gap-3 p-3">
      <h1 className="text-h3">주소 검색</h1>
      <Suspense>
        <Bridge />
      </Suspense>
    </main>
  );
}
