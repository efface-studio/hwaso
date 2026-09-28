import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import { seniorInitScript } from '@/stores/senior';
import { themeInitScript } from '@/stores/theme';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: '화소(畫所) — 작품과 사람이 만나는 곳', template: '%s | 화소' },
  description:
    '작품과 사람이 만나는 곳, 화소. 회화·판화·조각·고미술·골동품·컬렉터블을 사고팔고 실시간 경매에 참여하세요.',
  openGraph: { siteName: '화소', locale: 'ko_KR', type: 'website' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 저장된 테마를 첫 페인트 전에 적용 (깜빡임 방지) */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript + seniorInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
