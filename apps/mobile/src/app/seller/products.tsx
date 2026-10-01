import { ApiError } from '@shop/api-client';
import type { SellerProductRow } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { List } from '@/components/ui/list';
import i18n from '@/i18n';
import { formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { actionSheet, type SheetOption } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';
import { readable } from '@/hooks/use-layout';

type Filter = 'all' | 'selling' | 'draft' | 'hidden' | 'sold';
const FILTERS: Filter[] = ['all', 'selling', 'draft', 'hidden', 'sold'];
/** 필터 이름은 작품 상태 라벨을 그대로 쓴다 */
const filterLabel = (f: Filter) =>
  f === 'all'
    ? i18n.t('common:action.all')
    : label(
        'productStatus',
        ({ selling: 'ACTIVE', draft: 'DRAFT', hidden: 'HIDDEN', sold: 'SOLD' } as const)[f],
      );
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('common:state.actionFailed'));

/** 내 작품 관리: 상태별 목록, 눌러서 수정·게시·판매 중지/재개·삭제 */
const Sep = () => <Separator soft />;

export default function SellerProductsScreen() {
  const params = useLocalSearchParams<{ status?: string }>();
  const t = useTheme();
  const { t: tr } = useTranslation(['sell', 'common']);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>(FILTERS.find((f) => f === params.status) ?? 'all');
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
      {
        label: tr('common:action.edit'),
        onPress: () => router.push({ pathname: '/sell/[id]/edit', params: { id: p.id } }),
      },
      {
        label: tr('manage.viewListing'),
        onPress: () => router.push({ pathname: '/products/[id]', params: { id: p.id } }),
      },
    ];
    if (p.auction) {
      const auctionId = p.auction.id;
      options.push({
        label: tr('manage.viewAuction'),
        onPress: () => router.push({ pathname: '/auctions/[id]', params: { id: auctionId } }),
      });
    }
    if (p.status === 'DRAFT' && p.saleType !== 'AUCTION')
      options.push({
        label: tr('manage.publish'),
        onPress: () => void run(() => api.market.publishProduct(p.id), tr('manage.published')),
      });
    if (p.saleType === 'AUCTION' && (!p.auction || p.auction.status === 'DRAFT'))
      options.push({
        label: tr('manage.registerAuction'),
        onPress: () => router.push({ pathname: '/sell/[id]/auction', params: { id: p.id } }),
      });
    if (p.status === 'ACTIVE')
      options.push({
        label: tr('manage.pause'),
        onPress: () => void run(() => api.market.pauseProduct(p.id), tr('manage.paused')),
      });
    if (p.status === 'HIDDEN')
      options.push({
        label: tr('manage.resume'),
        onPress: () => void run(() => api.market.resumeProduct(p.id), tr('manage.resumed')),
      });
    options.push({
      label: tr('common:action.delete'),
      destructive: true,
      onPress: () =>
        Alert.alert(tr('manage.deleteConfirm'), tr('products.deleteMessage'), [
          { text: tr('common:action.cancel'), style: 'cancel' },
          {
            text: tr('common:action.delete'),
            style: 'destructive',
            onPress: () => void run(() => api.market.deleteProduct(p.id), tr('manage.deleted')),
          },
        ]),
    });
    actionSheet(p.title, options);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: tr('common:screen.sellerProducts') }} />
      <View style={[readable, { paddingVertical: 8 }]}>
        <Chips
          label={tr('products.filterLabel')}
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((value) => ({ value, label: filterLabel(value) }))}
        />
      </View>
      {q.isPending ? (
        <Loading variant="list" />
      ) : (
        <List
          contentContainerStyle={{ flexGrow: 1 }}
          data={q.data ?? []}
          keyExtractor={(p) => p.id}
          refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
          ItemSeparatorComponent={Sep}
          ListEmptyComponent={
            <Empty
              title={tr('products.empty')}
              action={{ title: tr('new.submit'), onPress: () => router.push('/sell/new') }}
            />
          }
          renderItem={({ item: p }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={tr('products.hint')}
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
                  {label('productStatus', p.status)}
                  {p.auction
                    ? ` · ${tr('products.auctionStatus', { status: label('auctionStatus', p.auction.status) })}`
                    : ''}
                </Text>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.title}
                </Text>
                <Text variant="small">
                  {p.auction
                    ? tr('products.auctionPrice', {
                        price: formatPrice(p.auction.currentPrice),
                        count: p.auction.bidCount,
                      })
                    : p.price != null
                      ? formatPrice(p.price)
                      : '-'}
                </Text>
                <Text variant="caption" color="muted">
                  {tr('products.stats', {
                    views: p.viewCount,
                    favorites: p.favoriteCount,
                    inquiries: p._count.inquiries,
                  })}
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
