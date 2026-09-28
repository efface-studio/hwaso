import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 문자열 제목은 하위 화면의 '%s | 화소' 템플릿을 끊으므로 템플릿을 다시 건다
export const metadata: Metadata = {
  title: { default: '작품 등록', template: '%s | 화소' },
  robots: { index: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
