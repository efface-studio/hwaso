import type { ProductCardDto } from '@shop/shared';
import { focusManager, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { useInfinitePullRefresh } from '@/hooks/use-pull-refresh';
import { ProductCard } from '@/components/product/product-card';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { List } from '@/components/ui/list';
import { useGrid } from '@/hooks/use-grid';
import { api } from '@/lib/api';
import { keepFirstPage } from '@/lib/infinite';
import { useTheme } from '@/theme';

type Tab = 'live' | 'scheduled' | 'ended';
const TABS: Tab[] = ['live', 'scheduled', 'ended'];
const LIVE_REFRESH_MS = 30_000;

/**
 * 경매: 진행 중·예정·종료 (웹 /auctions 와 같은 탭). 진행 중은 맨 위를 보고 있을 때 30초마다 새로 불러온다.
 * refetchInterval 은 무한 목록의 쌓인 페이지를 모두 차례로 다시 부르므로 쓰지 않고, 첫 페이지만 다시 부른다.
 */
export default function AuctionsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('home');
  const g = useGrid();
  const qc = useQueryClient();
  const { height: screenH } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('live');
  const focused = useIsFocused();
  const queryKey = ['auctions', tab];
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      api.auctions.list({ status: tab, cursor: pageParam, limit: 24 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // 다른 탭·화면을 보는 동안에는 갱신을 멈춘다
    subscribed: focused,
  });
  // 첫 화면 안쪽을 보고 있는지 — 아래쪽을 보는 중에 페이지를 줄이면 보던 내용이 사라지므로 그때는 건너뛴다
  const nearTop = useRef(true);
  useEffect(() => {
    if (tab !== 'live' || !focused) return;
    const key = ['auctions', tab];
    const timer = setInterval(() => {
      if (!nearTop.current || !focusManager.isFocused()) return;
      keepFirstPage(qc, key);
      void qc.refetchQueries({ queryKey: key, exact: true });
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab, focused, qc]);
  const pull = useInfinitePullRefresh(queryKey, q.refetch);
  const items: ProductCardDto[] = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total;

  return (
    <List
      key={g.columns}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      data={items}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ flexGrow: 1, gap: 20, paddingBottom: 32 }}
      ListHeaderComponent={
        <View style={{ paddingTop: 8 }}>
          <Chips
            label={tr('auctions.status')}
            value={tab}
            onChange={setTab}
            options={TABS.map((x) => {
              const label = tr(`auctions.tabs.${x}`);
              return { value: x, label: x === tab && total != null ? `${label} ${total}` : label };
            })}
          />
        </View>
      }
      ListEmptyComponent={
        q.isPending ? <Loading variant="grid" /> : <Empty kind="gavel" title={tr(`auctions.empty.${tab}`)} />
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} color={t.colors.muted} /> : null
      }
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      onEndReachedThreshold={0.5}
      onScroll={(e) => {
        nearTop.current = e.nativeEvent.contentOffset.y < screenH;
      }}
      scrollEventThrottle={200}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    />
  );
}
