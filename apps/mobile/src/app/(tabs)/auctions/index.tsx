import type { ProductCardDto } from '@shop/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { ProductCard } from '@/components/product/product-card';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { useGrid } from '@/hooks/use-grid';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Tab = 'live' | 'scheduled' | 'ended';
const TABS: { value: Tab; label: string }[] = [
  { value: 'live', label: '진행 중' },
  { value: 'scheduled', label: '예정' },
  { value: 'ended', label: '종료' },
];
const LIVE_REFRESH_MS = 30_000;

/** 경매: 진행 중·예정·종료 (웹 /auctions 와 같은 탭). 진행 중은 30초마다 새로 불러온다 */
export default function AuctionsScreen() {
  const t = useTheme();
  const g = useGrid();
  const [tab, setTab] = useState<Tab>('live');
  const q = useInfiniteQuery({
    queryKey: ['auctions', tab],
    queryFn: ({ pageParam, signal }) =>
      api.auctions.list({ status: tab, cursor: pageParam, limit: 24 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: tab === 'live' ? LIVE_REFRESH_MS : false,
  });
  const items: ProductCardDto[] = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total;
  const label = TABS.find((x) => x.value === tab)!.label;

  return (
    <FlatList
      key={g.columns}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      data={items}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ gap: 20, paddingBottom: 32 }}
      ListHeaderComponent={
        <View style={{ paddingTop: 8 }}>
          <Chips
            label="경매 상태"
            value={tab}
            onChange={setTab}
            options={TABS.map((x) => ({
              value: x.value,
              label: x.value === tab && total != null ? `${x.label} ${total}` : x.label,
            }))}
          />
        </View>
      }
      ListEmptyComponent={q.isPending ? <Loading /> : <Empty title={`${label}인 경매가 없어요`} />}
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} color={t.colors.muted} /> : null
      }
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    />
  );
}
