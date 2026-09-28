import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '전체 알림' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
