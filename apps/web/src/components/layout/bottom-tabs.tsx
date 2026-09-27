'use client';

import { Gavel, Home, MessageCircle, PlusSquare, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { CountBadge, useUnreadCounts } from './badges';

const TABS = [
  { href: '/', label: '홈', Icon: Home, match: (p: string) => p === '/' },
  { href: '/auctions', label: '경매', Icon: Gavel, match: (p: string) => p.startsWith('/auctions') },
  { href: '/sell', label: '판매', Icon: PlusSquare, match: (p: string) => p.startsWith('/sell') },
  { href: '/chat', label: '채팅', Icon: MessageCircle, match: (p: string) => p.startsWith('/chat') },
  { href: '/my', label: '마이', Icon: User, match: (p: string) => p.startsWith('/my') },
] as const;

/** 모바일(<768px) 전용 하단 탭 — docs/WEB_ROUTES.md 레이아웃 */
export function BottomTabs() {
  const pathname = usePathname();
  const unread = useUnreadCounts();
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-[var(--tabbar-h)] grid-cols-5">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-caption',
                  active ? 'text-foreground' : 'text-muted',
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.5} aria-hidden />
                  {href === '/chat' && <CountBadge n={unread.chat} className="-top-1.5 -right-2.5" />}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
