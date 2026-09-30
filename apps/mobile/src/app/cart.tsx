import { ApiError } from '@shop/api-client';
import { type CartItemDto } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { formatPrice } from '@/i18n/format';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

export const CART_KEY = ['cart'] as const;

function groupBySeller(items: CartItemDto[]) {
  const map = new Map<string, CartItemDto[]>();
  for (const i of items) map.set(i.seller.id, [...(map.get(i.seller.id) ?? []), i]);
  return [...map.values()];
}

/** 장바구니: 판매자별로 따로 주문·배송된다 */
export default function CartScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['order', 'common']);
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const q = useQuery({ queryKey: CART_KEY, queryFn: api.orders.cart, enabled: !!me });
  const refresh = () => void qc.invalidateQueries({ queryKey: CART_KEY });
  const onError = (e: unknown) =>
    Alert.alert(e instanceof ApiError ? e.message : tr('common:state.actionFailed'));
  const setQty = useMutation({
    mutationFn: ({ id, n }: { id: string; n: number }) => api.orders.putCart(id, n),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.orders.removeCart(id),
    onSuccess: refresh,
    onError,
  });

  if (!me)
    return (
      <Empty
        kind="lock"
        title={tr('cart.loginRequired')}
        action={{ title: tr('cart.login'), onPress: () => router.push('/login') }}
      />
    );
  if (q.isPending) return <Loading variant="list" />;
  if (!q.data?.length)
    return (
      <Empty
        kind="cart"
        title={tr('cart.empty.title')}
        description={tr('cart.empty.description')}
        action={{ title: tr('cart.browse'), onPress: () => router.push('/search') }}
      />
    );

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: tr('cart.title') }} />
      <Text variant="small" color="muted">
        {tr('cart.perSellerNotice')}
      </Text>
      {groupBySeller(q.data).map((group) => {
        const seller = group[0]!.seller;
        const buyable = group.filter((i) => i.available);
        const items = buyable.reduce((s, i) => s + (i.product.price ?? 0) * i.quantity, 0);
        const shipping = buyable.reduce((s, i) => s + i.product.shippingFee, 0);
        return (
          <View key={seller.id} style={[styles.group, { borderColor: t.colors.border }]}>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/users/[id]', params: { id: seller.id } })}
              style={[styles.seller, { borderColor: t.colors.border }]}
            >
              <Avatar avatarKey={seller.avatarKey} name={seller.nickname} size={28} />
              <Text variant="bodyStrong">{seller.nickname}</Text>
            </Pressable>
            {group.map((i) => (
              <View key={i.productId} style={[styles.item, !i.available && { opacity: 0.6 }]}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={i.product.title}
                  onPress={() => router.push({ pathname: '/products/[id]', params: { id: i.productId } })}
                  style={[styles.thumb, { backgroundColor: t.colors.backgroundSoft }]}
                >
                  {i.product.image && (
                    <Image
                      source={mediaUrl(i.product.image.key, 400)}
                      style={StyleSheet.absoluteFill}
                      contentFit="contain"
                    />
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="small" color="muted" numberOfLines={1}>
                    {i.product.artistName}
                  </Text>
                  <Text numberOfLines={2}>{i.product.title}</Text>
                  <Text variant="bodyStrong">
                    {i.product.price != null ? formatPrice(i.product.price) : '-'}
                  </Text>
                  {!i.available && (
                    <Text variant="small" color="destructive">
                      {tr('cart.unavailable')}
                    </Text>
                  )}
                  {i.available && i.product.stock > 1 && (
                    <View style={styles.qty}>
                      <Button
                        title="−"
                        size="sm"
                        variant="outline"
                        accessibilityLabel={tr('cart.decreaseQty')}
                        disabled={i.quantity <= 1}
                        onPress={() => setQty.mutate({ id: i.productId, n: i.quantity - 1 })}
                      />
                      <Text accessibilityLiveRegion="polite">{i.quantity}</Text>
                      <Button
                        title="+"
                        size="sm"
                        variant="outline"
                        accessibilityLabel={tr('cart.increaseQty')}
                        disabled={i.quantity >= i.product.stock}
                        onPress={() => setQty.mutate({ id: i.productId, n: i.quantity + 1 })}
                      />
                    </View>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('cart.removeItem', { title: i.product.title })}
                  hitSlop={10}
                  onPress={() => remove.mutate(i.productId)}
                >
                  <Text color="muted">✕</Text>
                </Pressable>
              </View>
            ))}
            <View style={[styles.foot, { backgroundColor: t.colors.backgroundSoft }]}>
              <Text variant="small">
                {tr('cart.summary', {
                  items: formatPrice(items),
                  shipping: shipping ? formatPrice(shipping) : tr('amount.free'),
                })}{' '}
                <Text variant="bodyStrong">{formatPrice(items + shipping)}</Text>
              </Text>
              <Button
                title={tr('cart.orderCount', { count: buyable.length })}
                disabled={!buyable.length}
                onPress={() =>
                  router.push({
                    pathname: '/checkout',
                    params: {
                      from: 'cart',
                      items: buyable.map((i) => `${i.productId}:${i.quantity}`).join(','),
                    },
                  })
                }
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, overflow: 'hidden' },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  item: { flexDirection: 'row', gap: 12, padding: 12 },
  thumb: { width: 80, height: 80, overflow: 'hidden' },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  foot: { padding: 12, gap: 10 },
});
