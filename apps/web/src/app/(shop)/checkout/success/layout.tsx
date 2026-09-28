import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '결제 완료', robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
