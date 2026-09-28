import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '장바구니', robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
