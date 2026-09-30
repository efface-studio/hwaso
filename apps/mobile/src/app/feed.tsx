import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { ProductCard } from '@/components/product/product-card';
import { Empty, Loading } from '@/components/ui/state';
import { List } from '@/components/ui/list';
import { useGrid } from '@/hooks/use-grid';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 팔로잉 새 작품: 팔로우한 판매자가 올린 작품을 최신순으로 */
export default function FeedScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['home', 'common']);
  const g = useGrid();
  const q = useInfiniteQuery({
    queryKey: ['following-feed'],
    queryFn: ({ pageParam }) => api.community.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pull = usePullRefresh(q.refetch);
  if (q.isPending) return <Loading variant="grid" />;
  return (
    <List
      key={g.columns}
      style={{ backgroundColor: t.colors.background }}
      data={pull.refreshing ? [] : (q.data?.pages.flatMap((p) => p.items) ?? [])}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ flexGrow: 1, gap: 20, paddingVertical: 16 }}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={<Stack.Screen options={{ title: tr('common:screen.feed') }} />}
      ListEmptyComponent={
        pull.refreshing ? (
          <Loading variant="grid" />
        ) : (
          <Empty
            kind="people"
            title={tr('feed.empty.title')}
            description={tr('feed.empty.description')}
            action={{ title: tr('feed.empty.action'), onPress: () => router.push('/search') }}
          />
        )
      }
    />
  );
}
