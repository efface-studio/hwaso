'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { appReturnUrl, withParams } from '@/lib/app-bridge';

/**
 * 앱 본인인증 브리지: 앱이 서버에서 준비한 인증 ID 로 PASS(포트원) 인증창을 열고, 결과를 앱으로 돌려보낸다.
 * 인증 완료 처리(/identity/complete)는 앱이 서버에 요청한다 — 서버가 포트원에 결과를 다시 조회해 검증한다.
 */
function Bridge() {
  const sp = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const ret = appReturnUrl(sp.get('return'));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const storeId = sp.get('storeId');
    const channelKey = sp.get('channelKey');
    const identityVerificationId = sp.get('id');
    if (!ret || !storeId || !channelKey || !identityVerificationId) {
      setError('잘못된 요청이에요. 앱에서 다시 시도해주세요.');
      return;
    }
    const done = `${window.location.origin}/app-bridge/done?${new URLSearchParams({ return: ret })}`;
    void import('@portone/browser-sdk/v2')
      .then((PortOne) =>
        PortOne.requestIdentityVerification({
          storeId,
          channelKey,
          identityVerificationId,
          // 모바일 브라우저는 인증 후 이 주소로 리다이렉트된다 (쿼리에 결과가 붙는다)
          redirectUrl: done,
        }),
      )
      .then((res) => {
        const params: Record<string, string> = res?.code
          ? { code: res.code, message: res.message ?? '' }
          : { identityVerificationId };
        window.location.replace(withParams(ret, params));
      })
      .catch((e: unknown) =>
        window.location.replace(
          withParams(ret, { code: 'IDENTITY_ERROR', message: (e as Error).message ?? '' }),
        ),
      );
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
      <p className="text-body">본인인증 창을 여는 중이에요…</p>
    </div>
  );
}

export default function AppIdentityBridgePage() {
  return (
    <main className="page-x mx-auto flex min-h-dvh max-w-md items-center justify-center">
      <Suspense>
        <Bridge />
      </Suspense>
    </main>
  );
}
