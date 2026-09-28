import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '카테고리' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
