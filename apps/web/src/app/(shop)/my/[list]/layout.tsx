import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const TITLE: Record<string, string> = { favorites: '관심 작품', recent: '최근 본 작품' };

export async function generateMetadata({ params }: { params: Promise<{ list: string }> }): Promise<Metadata> {
  const { list } = await params;
  return { title: TITLE[list] ?? '마이', robots: { index: false } };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
