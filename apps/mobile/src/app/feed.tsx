import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, RefreshControl } from 'react-native';
import { ProductCard } from '@/components/product/product-card';
import { Empty, Loading } from '@/components/ui/state';
import { useGrid } from '@/hooks/use-grid';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 팔로잉 새 작품: 팔로우한 판매자가 올린 작품을 최신순으로 */
export default function FeedScreen() {
  const t = useTheme();
  const g = useGrid();
  const q = useInfiniteQuery({
    queryKey: ['following-feed'],
    queryFn: ({ pageParam }) => api.community.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (q.isPending) return <Loading />;
  return (
    <FlatList
      key={g.columns}
      style={{ backgroundColor: t.colors.background }}
      data={q.data?.pages.flatMap((p) => p.items) ?? []}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ gap: 20, paddingVertical: 16 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={<Stack.Screen options={{ title: '팔로잉 새 작품' }} />}
      ListEmptyComponent={
        <Empty
          title="새 작품이 없어요"
          description="마음에 드는 판매자를 팔로우하면 새 작품을 여기서 볼 수 있어요."
          action={{ title: '작품 둘러보기', onPress: () => router.push('/search') }}
        />
      }
    />
  );
}
