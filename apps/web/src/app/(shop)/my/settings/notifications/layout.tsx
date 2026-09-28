import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '알림 설정', robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
