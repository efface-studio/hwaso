'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth';

/**
 * 로그인 필요한 화면. 앱 부팅 시 refresh 가 끝날 때까지 기다린 뒤 판단한다.
 * UX 목적일 뿐 실제 권한은 API 가 검증한다 (docs/WEB_ROUTES.md 인증 가드).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="불러오는 중">
        <Spinner className="size-6 text-muted" />
      </div>
    );
  }
  return <>{children}</>;
}
