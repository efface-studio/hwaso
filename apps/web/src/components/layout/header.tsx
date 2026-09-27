'use client';

import { Bell, MessageCircle, Search, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import { NAV_CATEGORIES } from '@/lib/categories';
import { Logo } from './logo';

function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };
  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="작품명, 작가, 시대, 소재 검색"
        aria-label="검색어"
        className="h-10 w-full rounded-sm bg-surface-2 pr-3 pl-9 text-body placeholder:text-faint focus:bg-background focus:outline-2 focus:outline-foreground"
      />
    </form>
  );
}

function AccountLinks() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const icon = 'inline-flex size-10 items-center justify-center rounded-sm hover:bg-surface-2';
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/sell"
        className="mr-2 hidden h-9 items-center rounded-sm px-3 text-label font-semibold hover:bg-surface-2 lg:inline-flex"
      >
        판매하기
      </Link>
      <Link href="/notifications" aria-label="알림" className={icon}>
        <Bell className="size-5" aria-hidden />
      </Link>
      <Link href="/chat" aria-label="채팅" className={cn(icon, 'hidden md:inline-flex')}>
        <MessageCircle className="size-5" aria-hidden />
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
        <Suspense fallback={<div className="hidden flex-1 md:block" />}>
          <SearchBox className="hidden max-w-xl flex-1 md:block" />
        </Suspense>
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
