import type { ReactNode } from 'react';
import { BottomTabs } from '@/components/layout/bottom-tabs';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:p-2"
      >
        본문으로 건너뛰기
      </a>
      <Header />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <Footer />
      <BottomTabs />
    </>
  );
}
