import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { formatDate, formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 판매자 정산: 구매 확정 후 수수료를 뺀 금액이 지급 예정으로 쌓인다 */
export default function SettlementsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['sell', 'common']);
  const q = useQuery({ queryKey: ['settlements'], queryFn: api.orders.settlements });
  const pull = usePullRefresh(q.refetch);
  if (q.isPending) return <Loading variant="plain-list" />;
  const data = q.data;
  if (!data) return <Empty kind="error" title={tr('settlements.loadFailed')} />;

  return (
    <List
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 10 }}
      data={data.items}
      keyExtractor={(s) => s.id}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Stack.Screen options={{ title: tr('common:screen.settlements') }} />
          <View style={styles.cards}>
            {(
              [
                [label('settlementStatus', 'SCHEDULED'), data.scheduled],
                [tr('settlements.pendingHeld'), data.pending],
                [label('settlementStatus', 'PAID'), data.paid],
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
            {tr('settlements.notice')}
          </Text>
          <Button
            title={tr('settlements.manageAccount')}
            variant="outline"
            size="sm"
            onPress={() => router.push('/seller/register')}
          />
        </View>
      }
      ListEmptyComponent={
        <Empty kind="doc" title={tr('settlements.empty')} description={tr('settlements.emptyDescription')} />
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
              {s.orderNumber} ·{' '}
              {tr('settlements.breakdown', {
                gross: formatPrice(s.grossAmount),
                fee: formatPrice(s.feeAmount),
              })}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text variant="bodyStrong">{formatPrice(s.netAmount)}</Text>
            <Text
              variant="caption"
              color={s.status === 'PAID' ? 'muted' : s.status === 'HELD' ? 'destructive' : 'primary'}
            >
              {label('settlementStatus', s.status)} · {formatDate(s.paidAt ?? s.scheduledAt)}
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
