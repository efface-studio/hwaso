import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '약관 동의' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
