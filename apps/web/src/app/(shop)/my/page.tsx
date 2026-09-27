'use client';

import {
  ChevronRight,
  Clock,
  Gavel,
  Heart,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/display';
import { logout } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';

const MENU = [
  {
    title: '쇼핑',
    items: [
      { href: '/my/purchases', label: '구매 내역', Icon: Receipt },
      { href: '/my/bids', label: '입찰 내역', Icon: Gavel },
      { href: '/my/wins', label: '낙찰 내역', Icon: Trophy },
      { href: '/my/favorites', label: '관심 작품', Icon: Heart },
      { href: '/my/recent', label: '최근 본 작품', Icon: Clock },
    ],
  },
  {
    title: '판매',
    items: [
      { href: '/sell', label: '작품 등록', Icon: Package },
      { href: '/seller', label: '판매 관리', Icon: Store },
      { href: '/my/seller', label: '판매자 정보 · 정산 계좌', Icon: ShieldCheck },
    ],
  },
] as const;

function MyHome() {
  const user = useAuthStore((s) => s.user)!;
  const router = useRouter();
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <div className="flex items-center gap-4">
        <Avatar avatarKey={user.profile.avatarKey} name={user.profile.nickname} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-h2">
            <span className="truncate">{user.profile.nickname}</span>
            {user.role === 'VERIFIED_SELLER' && <Badge tone="primary">인증 판매자</Badge>}
          </p>
          <p className="truncate text-small text-muted">
            {user.email.endsWith('.invalid') ? '소셜 계정' : user.email}
          </p>
        </div>
        <Link href={`/users/${user.id}`} className="shrink-0 text-small text-muted hover:text-foreground">
          내 프로필
        </Link>
      </div>

      {!user.identityVerified && (
        <Link
          href="/my/settings#identity"
          className="mt-6 flex items-center justify-between rounded-sm border border-border p-4 hover:border-foreground"
        >
          <span>
            <span className="block text-body-strong">본인인증을 완료해주세요</span>
            <span className="text-small text-muted">판매자 등록과 고액 경매 참여에 필요해요.</span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
      )}

      {MENU.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="mb-2 text-label text-muted">{g.title}</h2>
          <ul className="divide-y divide-border-soft border-y border-border-soft">
            {g.items.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link href={href} className="flex h-14 items-center gap-3 hover:bg-background-soft">
                  <Icon className="size-5 text-muted" aria-hidden />
                  <span className="flex-1 text-body">{label}</span>
                  <ChevronRight className="size-4 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-8">
        <ul className="divide-y divide-border-soft border-y border-border-soft">
          <li>
            <Link href="/my/settings" className="flex h-14 items-center gap-3 hover:bg-background-soft">
              <Settings className="size-5 text-muted" aria-hidden />
              <span className="flex-1 text-body">설정</span>
              <ChevronRight className="size-4 text-faint" aria-hidden />
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace('/');
              }}
              className="flex h-14 w-full items-center gap-3 text-left hover:bg-background-soft"
            >
              <LogOut className="size-5 text-muted" aria-hidden />
              <span className="flex-1 text-body">로그아웃</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function MyPage() {
  return (
    <RequireAuth>
      <MyHome />
    </RequireAuth>
  );
}
