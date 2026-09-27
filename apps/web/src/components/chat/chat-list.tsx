'use client';

import { formatRelativeTime } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { BellOff, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MediaImage } from '@/components/product/media-image';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { CHAT_ROOMS_KEY } from '@/lib/realtime-sync';

/** 채팅 목록: 최근 대화 순, 안 읽은 수·알림 끔 표시. 실시간 메시지가 오면 RealtimeSync 가 갱신한다 */
export function ChatList() {
  const pathname = usePathname();
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
  return (
    <ul className="divide-y divide-border-soft">
      {data.map((r) => {
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
                  {r.muted && <BellOff className="size-3.5 shrink-0 text-faint" aria-label="알림 꺼짐" />}
                  {r.lastMessage && (
                    <span className="shrink-0 text-caption text-faint">
                      {formatRelativeTime(r.lastMessage.createdAt)}
                    </span>
                  )}
                </p>
                <p className="truncate text-small text-muted">{r.lastMessage?.preview ?? r.product?.title}</p>
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
  );
}
