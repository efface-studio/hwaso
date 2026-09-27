'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { ChatList } from '@/components/chat/chat-list';
import { cn } from '@/lib/cn';

/** 헤더(카테고리 줄 포함) 높이를 재서 채팅 영역이 화면에 꼭 맞게 한다 */
function useHeaderHeight() {
  const [h, setH] = useState(96);
  useEffect(() => {
    const el = document.querySelector('header');
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return h;
}

/**
 * 데스크톱: 목록 | 대화 두 칸 (화면 높이에 고정)
 * 모바일: 목록은 일반 화면, 대화는 헤더·탭을 덮는 전체 화면 (네이티브 채팅 앱과 같은 방식)
 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  const inRoom = usePathname() !== '/chat';
  const header = useHeaderHeight();
  return (
    <RequireAuth>
      <div
        className="mx-auto max-w-page md:grid md:h-[var(--chat-h)] md:grid-cols-[340px_1fr] md:border-x md:border-border"
        style={{ '--chat-h': `calc(100dvh - ${header}px)` } as React.CSSProperties}
      >
        <aside
          className={cn(
            'md:min-h-0 md:overflow-y-auto md:border-r md:border-border',
            inRoom && 'hidden md:block',
          )}
        >
          <h1 className="px-4 pt-5 pb-3 text-h2">채팅</h1>
          <ChatList />
        </aside>
        <section
          className={cn(
            'min-h-0',
            inRoom
              ? 'fixed inset-0 z-50 flex bg-background pb-[env(safe-area-inset-bottom)] md:static md:z-auto md:pb-0'
              : 'hidden md:flex',
          )}
        >
          {children}
        </section>
      </div>
    </RequireAuth>
  );
}
