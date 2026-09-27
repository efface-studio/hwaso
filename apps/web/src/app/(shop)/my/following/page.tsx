'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { FollowList } from '@/components/community/follow-list';
import { ProductGrid } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

function Feed() {
  const q = useInfiniteQuery({
    queryKey: ['following-feed'],
    queryFn: ({ pageParam }) => api.community.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (!items.length)
    return (
      <EmptyState
        icon={<UserPlus />}
        title="팔로우한 판매자의 새 작품이 여기에 모여요"
        description="마음에 드는 판매자의 프로필에서 팔로우해보세요."
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <ProductGrid items={items} />
      {q.hasNextPage && (
        <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          더 보기
        </Button>
      )}
    </div>
  );
}

function Following() {
  const user = useAuthStore((s) => s.user)!;
  return (
    <Tabs defaultValue="feed">
      <TabsList>
        <TabsTrigger value="feed">새 작품</TabsTrigger>
        <TabsTrigger value="people">팔로잉</TabsTrigger>
      </TabsList>
      <TabsContent value="feed" className="pt-4">
        <Feed />
      </TabsContent>
      <TabsContent value="people" className="pt-4">
        <FollowList userId={user.id} kind="following" />
      </TabsContent>
    </Tabs>
  );
}

export default function MyFollowingPage() {
  return (
    <div className="page-x mx-auto max-w-page py-6 md:py-10">
      <h1 className="mb-6 text-h1">팔로잉</h1>
      <RequireAuth>
        <Following />
      </RequireAuth>
    </div>
  );
}
