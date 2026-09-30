import { ORDER_LIST_FILTERS, formatPrice, type OrderListQuery } from '@shop/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { OrderItemRow, OrderStatusBadge } from '@/components/order/order-ui';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Filter = OrderListQuery['filter'];
const LABEL: Record<Filter, string> = {
  all: '전체',
  pending: '결제 대기',
  progress: '진행 중',
  done: '완료',
  cancelled: '취소',
};

/** 구매 내역(기본) · 판매 주문(?as=seller) 공용 목록 */
export default function OrdersScreen() {
  const params = useLocalSearchParams<{ as?: string; filter?: string }>();
  const as = params.as === 'seller' ? 'seller' : 'buyer';
  const t = useTheme();
  const [filter, setFilter] = useState<Filter>(ORDER_LIST_FILTERS.find((f) => f === params.filter) ?? 'all');
  const q = useInfiniteQuery({
    queryKey: ['orders', as, filter],
    queryFn: ({ pageParam }) =>
      (as === 'buyer' ? api.orders.list : api.orders.sellerOrders)({ filter, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pull = usePullRefresh(q.refetch);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: as === 'buyer' ? '구매 내역' : '판매 주문' }} />
      <View style={{ paddingVertical: 8 }}>
        <Chips
          label="주문 상태"
          value={filter}
          onChange={setFilter}
          options={ORDER_LIST_FILTERS.map((f) => ({ value: f, label: LABEL[f] }))}
        />
      </View>
      {q.isPending ? (
        <Loading variant="list" />
      ) : (
        <List
          data={pull.refreshing ? [] : rows}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 12 }}
          refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          ListEmptyComponent={
            pull.refreshing ? (
              <Loading variant="list" />
            ) : (
              <Empty
                kind="box"
                title={as === 'buyer' ? '주문 내역이 없어요' : '받은 주문이 없어요'}
                action={
                  as === 'buyer'
                    ? { title: '작품 둘러보기', onPress: () => router.push('/search') }
                    : undefined
                }
              />
            )
          }
          renderItem={({ item: o }) => (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/orders/[id]', params: { id: o.id } })}
              style={[styles.card, { borderColor: t.colors.border }]}
            >
              <View style={styles.head}>
                <OrderStatusBadge status={o.status} />
                <Text variant="caption" color="muted" style={{ flex: 1 }}>
                  {new Date(o.createdAt).toLocaleDateString('ko-KR')} · {o.orderNumber}
                </Text>
                <Text variant="caption" color="muted">
                  {as === 'buyer' ? '판매자' : '구매자'} {o.counterpart.nickname}
                </Text>
              </View>
              <OrderItemRow item={o.items[0]!} compact />
              <View style={styles.head}>
                <Text variant="small" color="muted" style={{ flex: 1 }}>
                  {o.items.length > 1 ? `외 ${o.items.length - 1}건` : ''}
                </Text>
                <Text variant="bodyStrong">{formatPrice(o.totalAmount)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
