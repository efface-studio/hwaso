'use client';

import {
  BarChart3,
  Bell,
  Box,
  CreditCard,
  FileText,
  Flag,
  FolderTree,
  Gavel,
  Image as ImageIcon,
  Receipt,
  ScrollText,
  Store,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Logo } from '@/components/layout/logo';
import { EmptyState } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';

const NAV = [
  { group: '운영', items: [{ href: '/admin', label: '대시보드', Icon: BarChart3 }] },
  {
    group: '회원',
    items: [
      { href: '/admin/users', label: '회원', Icon: Users },
      { href: '/admin/sellers', label: '판매자 인증', Icon: Store },
      { href: '/admin/reports', label: '신고', Icon: Flag },
    ],
  },
  {
    group: '작품 · 경매',
    items: [
      { href: '/admin/products', label: '작품 · 검수', Icon: Box },
      { href: '/admin/auctions', label: '경매', Icon: Gavel },
      { href: '/admin/categories', label: '카테고리', Icon: FolderTree },
    ],
  },
  {
    group: '거래',
    items: [
      { href: '/admin/orders', label: '주문', Icon: Receipt },
      { href: '/admin/payments', label: '결제', Icon: CreditCard },
      { href: '/admin/settlements', label: '정산', Icon: Wallet },
      { href: '/admin/coupons', label: '쿠폰', Icon: Ticket },
    ],
  },
  {
    group: '콘텐츠',
    items: [
      { href: '/admin/banners', label: '배너', Icon: ImageIcon },
      { href: '/admin/notices', label: '공지사항', Icon: FileText },
      { href: '/admin/broadcast', label: '전체 알림', Icon: Bell },
      { href: '/admin/audit-logs', label: '감사 로그', Icon: ScrollText },
    ],
  },
] as const;

function Guard({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN')
    return (
      <EmptyState title="관리자만 볼 수 있는 화면이에요" description="관리자 계정으로 로그인해주세요." />
    );
  return <>{children}</>;
}

/** 관리자 콘솔: 데스크톱 사이드바 / 모바일 가로 스크롤 메뉴. 쇼핑 화면과 헤더를 공유하지 않는다 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));
  return (
    <RequireAuth>
      <Guard>
        <div className="min-h-dvh bg-background-soft md:grid md:grid-cols-[220px_1fr]">
          <aside className="sticky top-0 z-30 border-b border-border bg-background md:h-dvh md:overflow-y-auto md:border-r md:border-b-0">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <span className="text-caption font-semibold text-muted">관리자</span>
            </div>
            <nav
              aria-label="관리자 메뉴"
              className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-4 md:px-3 md:pb-6"
            >
              {NAV.map((g) => (
                <div key={g.group} className="flex gap-1 md:flex-col">
                  <p className="hidden px-2 text-caption text-faint md:block">{g.group}</p>
                  {g.items.map(({ href, label, Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active(href) ? 'page' : undefined}
                      className={cn(
                        'flex h-9 shrink-0 items-center gap-2 rounded-sm px-2 text-label whitespace-nowrap',
                        active(href)
                          ? 'bg-surface-2 text-foreground'
                          : 'text-muted hover:bg-surface-2 hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </Link>
                  ))}
                </div>
              ))}
              <Link
                href="/"
                className="hidden h-9 items-center px-2 text-label text-muted hover:text-foreground md:flex"
              >
                ← 사이트로 돌아가기
              </Link>
            </nav>
          </aside>
          <main className="min-w-0 p-4 md:p-8">{children}</main>
        </div>
      </Guard>
    </RequireAuth>
  );
}

export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">{title}</h1>
          {description && <p className="mt-1 text-small text-muted">{description}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
