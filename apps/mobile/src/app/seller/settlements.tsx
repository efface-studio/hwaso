import { SETTLEMENT_STATUS_LABEL, formatPrice } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 판매자 정산: 구매 확정 후 수수료를 뺀 금액이 지급 예정으로 쌓인다 */
export default function SettlementsScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['settlements'], queryFn: api.orders.settlements });
  const pull = usePullRefresh(q.refetch);
  if (q.isPending) return <Loading variant="plain-list" />;
  const data = q.data;
  if (!data) return <Empty kind="error" title="정산 정보를 불러오지 못했어요" />;

  return (
    <FlatList
      alwaysBounceVertical={false}
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 10 }}
      data={pull.refreshing ? [] : data.items}
      keyExtractor={(s) => s.id}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Stack.Screen options={{ title: '정산' }} />
          <View style={styles.cards}>
            {(
              [
                ['지급 예정', data.scheduled],
                ['대기·보류', data.pending],
                ['지급 완료', data.paid],
              ] as const
            ).map(([label, v]) => (
              <View key={label} style={[styles.card, { borderColor: t.colors.border }]}>
                <Text variant="caption" color="muted">
                  {label}
                </Text>
                <Text variant="bodyStrong">{formatPrice(v)}</Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color="muted">
            구매 확정 2일 뒤 등록된 정산 계좌로 지급돼요. 판매 수수료는 작품 금액의 8%이며 배송비에는 붙지
            않아요.
          </Text>
          <Button
            title="정산 계좌 관리"
            variant="outline"
            size="sm"
            onPress={() => router.push('/seller/register')}
          />
        </View>
      }
      ListEmptyComponent={
        pull.refreshing ? (
          <Loading variant="plain-list" />
        ) : (
          <Empty kind="doc" title="정산 내역이 없어요" description="구매 확정된 주문부터 정산돼요." />
        )
      }
      renderItem={({ item: s }) => (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/orders/[id]', params: { id: s.orderId } })}
          style={[styles.row, { borderColor: t.colors.borderSoft }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1}>{s.title}</Text>
            <Text variant="caption" color="muted">
              {s.orderNumber} · 판매 {formatPrice(s.grossAmount)} − 수수료 {formatPrice(s.feeAmount)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text variant="bodyStrong">{formatPrice(s.netAmount)}</Text>
            <Text
              variant="caption"
              color={s.status === 'PAID' ? 'muted' : s.status === 'HELD' ? 'destructive' : 'primary'}
            >
              {SETTLEMENT_STATUS_LABEL[s.status]} ·{' '}
              {new Date(s.paidAt ?? s.scheduledAt).toLocaleDateString('ko-KR')}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
