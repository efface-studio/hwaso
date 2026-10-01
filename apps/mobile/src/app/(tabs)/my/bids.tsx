import type { MyBidDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { List } from '@/components/ui/list';
import i18n from '@/i18n';
import { formatPrice, formatRelative } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useTheme, type Colors } from '@/theme';

function status(b: MyBidDto): { label: string; color: keyof Colors } {
  const a = b.auction;
  if (a.status === 'LIVE')
    return a.highestBidderIsMe
      ? { label: i18n.t('product:bids.status.leading'), color: 'primary' }
      : { label: i18n.t('product:bids.status.outbid'), color: 'destructive' };
  if (a.status === 'ENDED' || a.status === 'SETTLED') {
    if (a.highestBidderIsMe && a.result === 'SOLD')
      return { label: i18n.t('product:bids.status.won'), color: 'primary' };
    if (a.highestBidderIsMe && a.result === 'UNPAID')
      return { label: i18n.t('product:bids.status.unpaid'), color: 'destructive' };
    return { label: i18n.t('product:bids.status.lost'), color: 'muted' };
  }
  return { label: label('auctionStatus', a.status), color: 'muted' };
}

/** 입찰 내역 · 낙찰 내역. 낙찰 주문은 여기서 바로 결제한다 */
const Sep = () => <Separator soft />;

export default function MyBidsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('product');
  const [tab, setTab] = useState<'bids' | 'wins'>('bids');
  const q = useQuery({
    queryKey: [tab === 'wins' ? 'my-wins' : 'my-bids'],
    queryFn: tab === 'wins' ? api.auctions.myWins : api.auctions.myBids,
  });
  const pull = usePullRefresh(q.refetch);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: tr('bids.title'), headerLargeTitle: false }} />
      <View style={{ paddingVertical: 8 }}>
        <Chips
          label={tr('bids.view')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'bids', label: tr('bids.tabBids') },
            { value: 'wins', label: tr('bids.tabWins') },
          ]}
        />
      </View>
      {q.isPending ? (
        <Loading variant="list" />
      ) : (
        <List
          contentContainerStyle={{ flexGrow: 1 }}
          data={q.data ?? []}
          keyExtractor={(b) => b.auction.id}
          refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
          ItemSeparatorComponent={Sep}
          ListEmptyComponent={
            <Empty
              kind="gavel"
              title={tab === 'wins' ? tr('bids.emptyWins') : tr('bids.emptyBids')}
              action={{ title: tr('bids.browse'), onPress: () => router.push('/auctions') }}
            />
          }
          renderItem={({ item: b }) => {
            const s = status(b);
            return (
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={b.product.title}
                  onPress={() => router.push({ pathname: '/auctions/[id]', params: { id: b.auction.id } })}
                  style={[styles.thumb, { backgroundColor: t.colors.backgroundSoft }]}
                >
                  {b.product.image && (
                    <Image
                      source={mediaUrl(b.product.image.key, 400)}
                      style={StyleSheet.absoluteFill}
                      contentFit="contain"
                    />
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" color={s.color}>
                    {s.label}
                  </Text>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {b.product.title}
                  </Text>
                  <Text variant="small" color="muted">
                    {tr('bids.summary', {
                      max: formatPrice(b.myMaxBid),
                      count: b.myBidCount,
                      current: formatPrice(b.auction.currentPrice),
                      time: formatRelative(b.lastBidAt),
                    })}
                  </Text>
                </View>
                {b.orderId && (
                  <Button
                    title={tr('bids.pay')}
                    size="sm"
                    onPress={() => router.push({ pathname: '/orders/[id]', params: { id: b.orderId! } })}
                  />
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  thumb: { width: 72, height: 72, overflow: 'hidden' },
});
