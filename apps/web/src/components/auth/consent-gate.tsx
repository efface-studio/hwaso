'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';

/** 동의 전에도 볼 수 있어야 하는 화면 — 약관 전문·고객센터·계정 삭제 안내, 인증 복귀, 앱 브리지 */
const OPEN_PATHS = [
  '/consent',
  '/login',
  '/signup',
  '/terms',
  '/privacy',
  '/policy/',
  '/policies/',
  '/support',
  '/account-deletion',
  '/auth/',
  '/app-bridge/',
];

const isOpen = (path: string) =>
  OPEN_PATHS.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`));

/**
 * 필수 약관(이용약관·개인정보·만 14세)에 동의하지 않은 로그인 사용자를 /consent 로 보낸다.
 * 서버도 동의 전 쓰기 요청을 CONSENT_REQUIRED 로 막는다 — 이 가드는 UX 용.
 */
export function ConsentGate() {
  const required = useAuthStore((s) => s.user?.consentRequired === true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!required || isOpen(pathname)) return;
    router.replace(`/consent?next=${encodeURIComponent(pathname + window.location.search)}`);
  }, [required, pathname, router]);

  return null;
}
