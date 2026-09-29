'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect } from 'react';
import { PostcodeSearch } from '@/components/order/postcode';
import { appReturnUrl, withParams } from '@/lib/app-bridge';

/**
 * 앱 우편번호 브리지: 카카오 우편번호로 주소를 고르면 우편번호·주소를 앱으로 돌려보낸다.
 * 앱이 넘긴 theme(light·dark)으로 페이지와 우편번호를 그린다 — 앱 테마가 시스템 설정과 다를 수 있다.
 */
function Bridge() {
  const sp = useSearchParams();
  const ret = appReturnUrl(sp.get('return'));
  const t = sp.get('theme');
  const scheme = t === 'light' || t === 'dark' ? t : undefined;
  useEffect(() => {
    if (scheme) document.documentElement.setAttribute('data-theme', scheme);
  }, [scheme]);
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
  return <PostcodeSearch onSelect={onSelect} scheme={scheme} />;
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
