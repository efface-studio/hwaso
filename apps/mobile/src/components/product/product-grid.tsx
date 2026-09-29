import type { ProductCardDto, ProductListParams } from '@shop/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Empty, Loading } from '@/components/ui/state';
import { useGrid } from '@/hooks/use-grid';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { ProductCard } from './product-card';

/** 작품 목록 그리드: 무한 스크롤 + 당겨서 새로고침 */
export function ProductGrid({
  params,
  header,
  emptyTitle = '조건에 맞는 작품이 없어요',
}: {
  params: ProductListParams;
  header?: ReactElement;
  emptyTitle?: string;
}) {
  const t = useTheme();
  const g = useGrid();
  const q = useInfiniteQuery({
    queryKey: ['products', params],
    queryFn: ({ pageParam, signal }) =>
      api.market.products({ ...params, cursor: pageParam, limit: 24 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pull = usePullRefresh(q.refetch);
  const items: ProductCardDto[] = pull.refreshing ? [] : (q.data?.pages.flatMap((p) => p.items) ?? []);
  return (
    <FlatList
      alwaysBounceVertical={false}
      key={g.columns}
      data={items}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        q.isPending || pull.refreshing ? (
          <Loading variant="grid" />
        ) : (
          <Empty kind="search" title={emptyTitle} />
        )
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator color={t.colors.muted} style={{ margin: 16 }} /> : null
      }
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ flexGrow: 1, gap: 20, paddingBottom: 32 }}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      onEndReachedThreshold={0.6}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    />
  );
}
