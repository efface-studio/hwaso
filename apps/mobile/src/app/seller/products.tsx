import { ApiError } from '@shop/api-client';
import { AUCTION_STATUS_LABEL, PRODUCT_STATUS_LABEL, formatPrice, type SellerProductRow } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { actionSheet, type SheetOption } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

type Filter = 'all' | 'selling' | 'draft' | 'hidden' | 'sold';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'selling', label: '판매 중' },
  { value: 'draft', label: '임시 저장' },
  { value: 'hidden', label: '판매 중지' },
  { value: 'sold', label: '판매 완료' },
];
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했어요.');

/** 내 작품 관리: 상태별 목록, 눌러서 수정·게시·판매 중지/재개·삭제 */
const Sep = () => <Separator soft />;

export default function SellerProductsScreen() {
  const params = useLocalSearchParams<{ status?: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>(
    FILTERS.find((f) => f.value === params.status)?.value ?? 'all',
  );
  const q = useQuery({
    queryKey: ['seller', 'products', filter],
    queryFn: () => api.market.sellerProducts(filter),
  });
  const pull = usePullRefresh(q.refetch);
  const run = (fn: () => Promise<unknown>, done: string) =>
    fn().then(
      () => {
        Alert.alert(done);
        void qc.invalidateQueries({ queryKey: ['seller'] });
      },
      (e: unknown) => Alert.alert(errMsg(e)),
    );

  const menu = (p: SellerProductRow) => {
    const options: SheetOption[] = [
      { label: '수정', onPress: () => router.push({ pathname: '/sell/[id]/edit', params: { id: p.id } }) },
      {
        label: '판매 페이지 보기',
        onPress: () => router.push({ pathname: '/products/[id]', params: { id: p.id } }),
      },
    ];
    if (p.auction) {
      const auctionId = p.auction.id;
      options.push({
        label: '경매 보기',
        onPress: () => router.push({ pathname: '/auctions/[id]', params: { id: auctionId } }),
      });
    }
    if (p.status === 'DRAFT' && p.saleType !== 'AUCTION')
      options.push({
        label: '게시하기',
        onPress: () => void run(() => api.market.publishProduct(p.id), '작품을 게시했어요'),
      });
    if (p.saleType === 'AUCTION' && (!p.auction || p.auction.status === 'DRAFT'))
      options.push({
        label: '경매 등록',
        onPress: () => router.push({ pathname: '/sell/[id]/auction', params: { id: p.id } }),
      });
    if (p.status === 'ACTIVE')
      options.push({
        label: '판매 중지',
        onPress: () => void run(() => api.market.pauseProduct(p.id), '판매를 중지했어요'),
      });
    if (p.status === 'HIDDEN')
      options.push({
        label: '판매 재개',
        onPress: () => void run(() => api.market.resumeProduct(p.id), '판매를 다시 시작했어요'),
      });
    options.push({
      label: '삭제',
      destructive: true,
      onPress: () =>
        Alert.alert('작품을 삭제할까요?', '되돌릴 수 없어요.', [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => void run(() => api.market.deleteProduct(p.id), '작품을 삭제했어요'),
          },
        ]),
    });
    actionSheet(p.title, options);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: '내 작품' }} />
      <View style={{ paddingVertical: 8 }}>
        <Chips label="작품 상태" value={filter} onChange={setFilter} options={FILTERS} />
      </View>
      {q.isPending ? (
        <Loading variant="list" />
      ) : (
        <FlatList
          alwaysBounceVertical={false}
          contentContainerStyle={{ flexGrow: 1 }}
          data={pull.refreshing ? [] : (q.data ?? [])}
          keyExtractor={(p) => p.id}
          refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
          ItemSeparatorComponent={Sep}
          ListEmptyComponent={
            pull.refreshing ? (
              <Loading variant="list" />
            ) : (
              <Empty
                title="작품이 없어요"
                action={{ title: '작품 등록하기', onPress: () => router.push('/sell/new') }}
              />
            )
          }
          renderItem={({ item: p }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="눌러서 관리 메뉴 열기"
              onPress={() => menu(p)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.colors.surface2 }]}
            >
              <View style={[styles.thumb, { backgroundColor: t.colors.backgroundSoft }]}>
                {p.images[0] && (
                  <Image
                    source={mediaUrl(p.images[0].key, 400)}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                  />
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" color={p.status === 'ACTIVE' ? 'primary' : 'muted'}>
                  {PRODUCT_STATUS_LABEL[p.status]}
                  {p.auction ? ` · 경매 ${AUCTION_STATUS_LABEL[p.auction.status]}` : ''}
                </Text>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.title}
                </Text>
                <Text variant="small">
                  {p.auction
                    ? `현재 ${formatPrice(p.auction.currentPrice)} · 입찰 ${p.auction.bidCount}회`
                    : p.price != null
                      ? formatPrice(p.price)
                      : '-'}
                </Text>
                <Text variant="caption" color="muted">
                  조회 {p.viewCount} · 관심 {p.favoriteCount} · 문의 {p._count.inquiries}
                </Text>
              </View>
              <Text color="faint">⋯</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  thumb: { width: 72, height: 72, overflow: 'hidden' },
});
