'use client';

import { CHAT_ROOM_FILTERS, filterChatRooms, formatRelativeTime, type ChatRoomFilter } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { BellOff, MessageCircle, Pin, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { MediaImage } from '@/components/product/media-image';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { CHAT_ROOMS_KEY } from '@/lib/realtime-sync';

/**
 * 채팅 목록: 고정한 방 먼저, 그다음 최근 대화 순. 구매·판매·안 읽음 필터와 닉네임·작품명 검색.
 * 실시간 메시지가 오면 RealtimeSync 가 갱신한다
 */
export function ChatList() {
  const pathname = usePathname();
  const [filter, setFilter] = useState<ChatRoomFilter>('all');
  const [query, setQuery] = useState('');
  const { data, isPending } = useQuery({ queryKey: CHAT_ROOMS_KEY, queryFn: api.chat.rooms });
  if (isPending) return <Skeleton className="m-4 h-60" />;
  if (!data?.length)
    return (
      <EmptyState
        icon={<MessageCircle />}
        title="아직 대화가 없어요"
        description="작품 상세에서 판매자에게 궁금한 점을 물어보세요."
      />
    );
  const rooms = filterChatRooms(data, filter, query);
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border-soft px-4 py-3">
        <label className="relative block">
          <span className="sr-only">채팅 검색</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임, 작품명 검색"
            className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-small outline-none focus:border-foreground"
          />
        </label>
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="채팅 필터">
          {CHAT_ROOM_FILTERS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-caption',
                filter === k ? 'border-foreground bg-foreground text-background' : 'border-border',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!rooms.length && (
        <p className="px-4 py-10 text-center text-small text-muted">
          {query.trim() ? '검색 결과가 없어요.' : '해당하는 대화가 없어요.'}
        </p>
      )}
      <ul className="divide-y divide-border-soft">
        {rooms.map((r) => {
          const active = pathname === `/chat/${r.id}`;
          return (
            <li key={r.id}>
              <Link
                href={`/chat/${r.id}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 hover:bg-background-soft',
                  active && 'bg-surface-2',
                )}
              >
                <Avatar avatarKey={r.counterpart.avatarKey} name={r.counterpart.nickname} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate text-body-strong">{r.counterpart.nickname}</span>
                    {r.pinned && <Pin className="size-3.5 shrink-0 text-faint" aria-label="고정됨" />}
                    {r.muted && <BellOff className="size-3.5 shrink-0 text-faint" aria-label="알림 꺼짐" />}
                    {r.lastMessage && (
                      <span className="shrink-0 text-caption text-faint">
                        {formatRelativeTime(r.lastMessage.createdAt)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-small text-muted">
                    {r.lastMessage?.preview ?? r.product?.title}
                  </p>
                </div>
                {r.unreadCount > 0 && (
                  <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground">
                    {r.unreadCount > 99 ? '99+' : r.unreadCount}
                    <span className="sr-only">개 안 읽음</span>
                  </span>
                )}
                {r.product && (
                  <span className="size-11 shrink-0 bg-background-soft">
                    <MediaImage image={r.product.image} alt="" sizes="44px" className="p-0.5" />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
