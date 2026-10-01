'use client';

import { ApiError } from '@shop/api-client';
import type { AuthProvider } from '@shop/shared';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { completeLogin, oauthRedirectUri } from '@/lib/auth';
import { webDevice } from '@/lib/device';
import { oauthStateMatches, takeOAuthIntent } from '@/lib/redirect';
import { toast } from '@/stores/toast';

const PROVIDERS: AuthProvider[] = ['GOOGLE', 'APPLE', 'KAKAO', 'NAVER'];

function Callback() {
  const { provider: raw } = useParams<{ provider: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const provider = raw.toUpperCase() as AuthProvider;
    const code = params.get('code');
    const state = params.get('state');
    const intent = takeOAuthIntent();
    const mode = intent?.mode ?? 'login';
    const next = intent?.next ?? '/';

    if (!PROVIDERS.includes(provider) || params.get('error') || !code || !state) {
      setError('로그인이 취소되었거나 요청이 올바르지 않습니다.');
      return;
    }
    // 이 탭에서 시작한 로그인이 아니면 거부한다 (다른 사람의 code/state 링크로 그 계정에 로그인되는 것 방지)
    if (!oauthStateMatches(intent, state)) {
      setError('로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.');
      return;
    }
    const redirectUri = oauthRedirectUri(provider);
    (async () => {
      try {
        if (mode === 'link') {
          await api.auth.linkSocial(provider, { code, state, redirectUri });
          toast.success('계정을 연결했어요');
          router.replace('/my/settings');
          return;
        }
        const r = await api.auth.oauthCallback(provider, {
          code,
          state,
          redirectUri,
          device: webDevice(),
          name: params.get('name') ?? undefined,
        });
        completeLogin(r);
        // 새로 가입한 소셜 사용자는 자동 생성된 닉네임을 바꿀 수 있게 안내한다
        router.replace(r.isNewUser ? `/my/settings?welcome=1&next=${encodeURIComponent(next)}` : next);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
      }
    })();
  }, [raw, params, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      {error ? (
        <>
          <p className="max-w-sm text-body">{error}</p>
          <Button asChild variant="outline">
            <Link href="/login">로그인으로 돌아가기</Link>
          </Button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-body text-muted" role="status">
          <Spinner className="size-4" />
          로그인하는 중…
        </p>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
