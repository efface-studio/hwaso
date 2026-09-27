import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/logo';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** 인증 화면: 헤더 최소화, 가운데 단일 폼 (docs/WEB_ROUTES.md) */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-x flex h-14 items-center md:h-16">
        <Logo />
      </header>
      <main className="page-x flex flex-1 justify-center pt-6 pb-16 md:pt-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
