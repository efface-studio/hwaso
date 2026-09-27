'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, MessageCircle, Search, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import { NAV_CATEGORIES } from '@/lib/categories';
import { SearchAutocomplete } from '@/components/search/search-autocomplete';
import { CountBadge, useUnreadCounts } from './badges';
import { Logo } from './logo';

function CartLink({ className }: { className: string }) {
  const { data } = useQuery({ queryKey: ['cart'], queryFn: api.orders.cart, staleTime: 60_000 });
  const n = data?.length ?? 0;
  return (
    <Link href="/cart" aria-label={n ? `장바구니 ${n}개` : '장바구니'} className={cn(className, 'relative')}>
      <ShoppingBag className="size-5" aria-hidden />
      <CountBadge n={n} />
    </Link>
  );
}

function AccountLinks() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const icon = 'relative inline-flex size-10 items-center justify-center rounded-sm hover:bg-surface-2';
  const unread = useUnreadCounts();
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/sell"
        className="mr-2 hidden h-9 items-center rounded-sm px-3 text-label font-semibold hover:bg-surface-2 lg:inline-flex"
      >
        판매하기
      </Link>
      {user && <CartLink className={icon} />}
      <Link
        href="/notifications"
        aria-label={unread.notifications ? `알림 ${unread.notifications}개 안 읽음` : '알림'}
        className={icon}
      >
        <Bell className="size-5" aria-hidden />
        <CountBadge n={unread.notifications} />
      </Link>
      <Link
        href="/chat"
        aria-label={unread.chat ? `채팅 ${unread.chat}개 안 읽음` : '채팅'}
        className={cn(icon, 'hidden md:inline-flex')}
      >
        <MessageCircle className="size-5" aria-hidden />
        <CountBadge n={unread.chat} />
      </Link>
      {ready && !user ? (
        <Link
          href="/login"
          className="ml-1 hidden h-9 items-center rounded-sm px-3 text-label font-semibold hover:bg-surface-2 md:inline-flex"
        >
          로그인
        </Link>
      ) : (
        <Link href="/my" aria-label="마이페이지" className={cn(icon, 'hidden md:inline-flex')}>
          <User className="size-5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="page-x mx-auto flex h-14 max-w-page items-center gap-4 md:h-16 md:gap-8">
        <Logo />
        <SearchAutocomplete className="hidden max-w-xl flex-1 md:block" />
        <div className="ml-auto flex items-center">
          <Link
            href="/search"
            aria-label="검색"
            className="inline-flex size-10 items-center justify-center rounded-sm hover:bg-surface-2 md:hidden"
          >
            <Search className="size-5" aria-hidden />
          </Link>
          <AccountLinks />
        </div>
      </div>
      <nav aria-label="카테고리" className="page-x mx-auto max-w-page">
        <ul className="-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none] md:gap-7">
          {NAV_CATEGORIES.map((c) => {
            const active = pathname === c.href || pathname.startsWith(`${c.href}/`);
            return (
              <li key={c.href} className="shrink-0">
                <Link
                  href={c.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center border-b-2 text-label transition-colors',
                    active
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted hover:text-foreground',
                    c.href === '/auctions' && 'font-semibold text-foreground',
                  )}
                >
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
