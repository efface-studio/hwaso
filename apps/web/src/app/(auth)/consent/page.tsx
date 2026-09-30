'use client';

import { ApiError } from '@shop/api-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { ConsentChecklist, EMPTY_CONSENT, hasRequiredConsent } from '@/components/auth/consent-checklist';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { logout, safeNext } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';

/**
 * 필수 약관에 동의하지 않은 계정(소셜 첫 로그인 등)은 로그인 후 이 화면을 거친다 (ConsentGate).
 * 동의하지 않으려면 로그아웃할 수 있다.
 */
function ConsentForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const setUser = useAuthStore((s) => s.setUser);
  const [consent, setConsent] = useState(EMPTY_CONSENT);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!ready || leaving) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(next)}`);
    else if (!user.consentRequired) router.replace(next);
  }, [ready, user, next, router, leaving]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasRequiredConsent(consent)) return setError('필수 항목에 모두 동의해주세요.');
    setPending(true);
    setError(null);
    try {
      setUser(
        await api.auth.consent({ terms: true, privacy: true, ageOver14: true, marketing: consent.marketing }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    setLeaving(true);
    await logout().catch(() => undefined);
    router.replace('/');
  };

  if (!ready || !user?.consentRequired) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="불러오는 중">
        <Spinner className="size-6 text-muted" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div>
        <h1 className="text-h1">약관에 동의해주세요</h1>
        <p className="mt-1 text-body text-muted">
          {user.profile.nickname}님, 화소를 이용하려면 아래 필수 항목에 동의가 필요해요.
        </p>
      </div>

      {error && <Alert tone="destructive">{error}</Alert>}

      <ConsentChecklist value={consent} onChange={setConsent} />

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" block loading={pending} disabled={!hasRequiredConsent(consent)}>
          동의하고 시작하기
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          block
          disabled={pending}
          onClick={() => void cancel()}
        >
          동의하지 않고 로그아웃
        </Button>
      </div>
    </form>
  );
}

export default function ConsentPage() {
  return (
    <Suspense>
      <ConsentForm />
    </Suspense>
  );
}
