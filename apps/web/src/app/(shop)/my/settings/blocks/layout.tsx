import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '차단한 사용자', robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
