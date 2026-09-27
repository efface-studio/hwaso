'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { FollowButton } from './follow-button';

export function FollowList({ userId, kind }: { userId: string; kind: 'followers' | 'following' }) {
  const q = useInfiniteQuery({
    queryKey: ['follows', userId, kind],
    queryFn: ({ pageParam }) =>
      (kind === 'followers' ? api.community.followers : api.community.following)(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Skeleton className="h-48 w-full" />;
  if (!items.length)
    return (
      <EmptyState
        icon={<Users />}
        title={kind === 'followers' ? '아직 팔로워가 없어요' : '팔로우한 사용자가 없어요'}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border-soft border-y border-border-soft">
        {items.map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-3">
            <Link href={`/users/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar avatarKey={u.avatarKey} name={u.nickname} />
              <span className="min-w-0">
                <span className="block truncate text-body-strong">{u.nickname}</span>
                <span className="block truncate text-small text-muted">
                  {u.sellingCount > 0 ? `판매 중 ${u.sellingCount}점` : u.bio || ' '}
                </span>
              </span>
            </Link>
            <FollowButton userId={u.id} initial={u.isFollowing} size="sm" />
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          더 보기
        </Button>
      )}
    </div>
  );
}
