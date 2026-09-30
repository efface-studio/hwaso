import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '가입 마무리' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
