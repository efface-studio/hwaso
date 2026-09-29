import type { ProductCardDto } from '@shop/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
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
  const focused = useIsFocused();
  const q = useInfiniteQuery({
    queryKey: ['auctions', tab],
    queryFn: ({ pageParam, signal }) =>
      api.auctions.list({ status: tab, cursor: pageParam, limit: 24 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: tab === 'live' ? LIVE_REFRESH_MS : false,
    // 다른 탭·화면을 보는 동안에는 주기 갱신을 멈춘다
    subscribed: focused,
  });
  const pull = usePullRefresh(q.refetch);
  const items: ProductCardDto[] = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total;
  const label = TABS.find((x) => x.value === tab)!.label;

  return (
    <FlatList
      alwaysBounceVertical={false}
      key={g.columns}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      data={pull.refreshing ? [] : items}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ flexGrow: 1, gap: 20, paddingBottom: 32 }}
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
      ListEmptyComponent={
        pull.refreshing ? (
          <Loading variant="grid" />
        ) : q.isPending ? (
          <Loading variant="grid" />
        ) : (
          <Empty kind="gavel" title={`${label}인 경매가 없어요`} />
        )
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} color={t.colors.muted} /> : null
      }
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    />
  );
}
