import { AUCTION_STATUS_LABEL, formatPrice, formatRelativeTime, type MyBidDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useTheme, type Colors } from '@/theme';

function status(b: MyBidDto): { label: string; color: keyof Colors } {
  const a = b.auction;
  if (a.status === 'LIVE')
    return a.highestBidderIsMe
      ? { label: '최고 입찰', color: 'primary' }
      : { label: '상회 입찰됨', color: 'destructive' };
  if (a.status === 'ENDED' || a.status === 'SETTLED') {
    if (a.highestBidderIsMe && a.result === 'SOLD') return { label: '낙찰', color: 'primary' };
    if (a.highestBidderIsMe && a.result === 'UNPAID') return { label: '미결제 취소', color: 'destructive' };
    return { label: '패찰', color: 'muted' };
  }
  return { label: AUCTION_STATUS_LABEL[a.status], color: 'muted' };
}

/** 입찰 내역 · 낙찰 내역. 낙찰 주문은 여기서 바로 결제한다 */
export default function MyBidsScreen() {
  const t = useTheme();
  const [tab, setTab] = useState<'bids' | 'wins'>('bids');
  const q = useQuery({
    queryKey: [tab === 'wins' ? 'my-wins' : 'my-bids'],
    queryFn: tab === 'wins' ? api.auctions.myWins : api.auctions.myBids,
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: '입찰·낙찰 내역', headerLargeTitle: false }} />
      <View style={{ paddingVertical: 8 }}>
        <Chips
          label="보기"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'bids', label: '입찰 내역' },
            { value: 'wins', label: '낙찰 내역' },
          ]}
        />
      </View>
      {q.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(b) => b.auction.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.borderSoft }} />
          )}
          ListEmptyComponent={
            <Empty
              title={tab === 'wins' ? '낙찰받은 작품이 없어요' : '입찰한 경매가 없어요'}
              action={{ title: '진행 중인 경매 보기', onPress: () => router.push('/auctions') }}
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
                    내 최고 {formatPrice(b.myMaxBid)} · {b.myBidCount}회 · 현재{' '}
                    {formatPrice(b.auction.currentPrice)} · {formatRelativeTime(b.lastBidAt)}
                  </Text>
                </View>
                {b.orderId && (
                  <Button
                    title="결제하기"
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
