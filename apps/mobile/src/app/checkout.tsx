import { ApiError } from '@shop/api-client';
import { type PaymentMethod } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddressPicker } from '@/components/order/address-list';
import { AmountSummary, OrderItemRow, payMethods } from '@/components/order/order-ui';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioList } from '@/components/ui/radio';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { formatPrice } from '@/i18n/format';
import { api } from '@/lib/api';
import { BridgeCancelled, payOrder } from '@/lib/bridge';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : i18n.t('common:state.actionFailed');

/** ?productId=&qty= (바로 구매) 또는 ?items=id:qty,id:qty&from=cart */
function parseItems(p: { productId?: string; qty?: string; items?: string }) {
  if (p.productId) return [{ productId: p.productId, quantity: Math.max(1, Number(p.qty) || 1) }];
  return (p.items ?? '')
    .split(',')
    .map((s) => s.split(':'))
    .filter(([id]) => id)
    .map(([productId, q]) => ({ productId: productId!, quantity: Math.max(1, Number(q) || 1) }))
    .slice(0, 50);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.section, { borderColor: t.colors.border }]}>
      <Text variant="h3" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** 주문서: 작품 확인 → 배송지 → 쿠폰 → 결제 수단 → 동의 → 결제 */
export default function CheckoutScreen() {
  const params = useLocalSearchParams<{ productId?: string; qty?: string; items?: string; from?: string }>();
  const items = useMemo(() => parseItems(params), [params]);
  const fromCart = params.from === 'cart';
  const t = useTheme();
  const { t: tr } = useTranslation(['order', 'common']);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | undefined>();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const quote = useQuery({
    queryKey: ['quote', items, coupon],
    queryFn: () => api.orders.quote({ items, couponCode: coupon }),
    retry: false,
    enabled: items.length > 0,
  });
  const couponError =
    coupon && quote.error instanceof ApiError && quote.error.code.startsWith('COUPON')
      ? quote.error.message
      : null;

  const place = async () => {
    setBusy(true);
    let orderId: string | null = null;
    try {
      orderId = (await api.orders.create({ items, addressId: addressId!, couponCode: coupon, fromCart })).id;
      await payOrder(orderId, method);
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      router.replace({ pathname: '/orders/[id]', params: { id: orderId, paid: '1' } });
    } catch (e) {
      if (!orderId) {
        Alert.alert(tr('checkout.orderFailed'), errMsg(e));
        setBusy(false);
        return;
      }
      if (e instanceof BridgeCancelled)
        Alert.alert(tr('checkout.payCancelled'), tr('checkout.payCancelledHint'));
      else Alert.alert(tr('pay.failed'), errMsg(e));
      void qc.invalidateQueries({ queryKey: ['orders'] });
      router.replace({ pathname: '/orders/[id]', params: { id: orderId } });
    }
  };

  if (!items.length) return <Empty kind="cart" title={tr('checkout.noItems')} />;
  if (quote.isPending) return <Loading variant="text" />;
  if (quote.error && !couponError)
    return (
      <Empty
        kind="error"
        title={tr('checkout.cannotOrder')}
        description={errMsg(quote.error)}
        action={{ title: fromCart ? tr('checkout.backToCart') : tr('checkout.goBack'), onPress: goBack }}
      />
    );
  const q = quote.data;
  const canPay = !!q && !!addressId && agreed && !busy && !couponError;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: tr('checkout.title') }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Section title={tr('checkout.section.items')}>
          {q?.items.map((i) => (
            <OrderItemRow key={i.productId} item={i} />
          ))}
        </Section>
        <Section title={tr('checkout.section.address')}>
          <AddressPicker selected={addressId} onSelect={setAddressId} />
        </Section>
        <Section title={tr('checkout.section.coupon')}>
          <View style={styles.coupon}>
            <View style={{ flex: 1 }}>
              <Field
                label={tr('checkout.couponCode')}
                placeholder={tr('checkout.couponPlaceholder')}
                autoCapitalize="characters"
                value={couponInput}
                onChangeText={setCouponInput}
                editable={!coupon}
                error={couponError}
              />
            </View>
            {coupon ? (
              <Button
                title={tr('checkout.couponRemove')}
                variant="outline"
                onPress={() => {
                  setCoupon(undefined);
                  setCouponInput('');
                }}
              />
            ) : (
              <Button
                title={tr('common:action.apply')}
                variant="outline"
                disabled={!couponInput.trim()}
                onPress={() => setCoupon(couponInput.trim().toUpperCase())}
              />
            )}
          </View>
          {q?.coupon && (
            <Text variant="small" color="primary">
              {tr('checkout.couponApplied', { name: q.coupon.name })}
            </Text>
          )}
        </Section>
        <Section title={tr('checkout.section.payMethod')}>
          <RadioList
            label={tr('checkout.section.payMethod')}
            value={method}
            onChange={setMethod}
            options={payMethods()}
          />
        </Section>
        <Section title={tr('checkout.section.amount')}>
          {q && <AmountSummary q={q} />}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed((v) => !v)}
            style={[styles.agree, { minHeight: t.touch }]}
          >
            <View
              style={[
                styles.box,
                {
                  borderColor: agreed ? t.colors.primary : t.colors.borderStrong,
                  backgroundColor: agreed ? t.colors.primary : 'transparent',
                },
              ]}
            >
              {agreed && (
                <Text variant="caption" color="primaryForeground">
                  ✓
                </Text>
              )}
            </View>
            <Text variant="small" style={{ flex: 1 }}>
              {tr('checkout.agree')}
            </Text>
          </Pressable>
          <Text variant="caption" color="muted">
            {tr('checkout.escrowNotice')}
          </Text>
        </Section>
      </ScrollView>
      <View
        style={[
          styles.bar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            borderColor: t.colors.border,
            backgroundColor: t.colors.background,
          },
        ]}
      >
        {!addressId && (
          <Text variant="small" color="muted" style={{ textAlign: 'center' }}>
            {tr('checkout.addAddress')}
          </Text>
        )}
        <Button
          title={q ? tr('pay.buttonAmount', { amount: formatPrice(q.totalAmount) }) : tr('pay.button')}
          size="lg"
          block
          disabled={!canPay}
          loading={busy}
          onPress={() => void place()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, paddingVertical: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth },
  coupon: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { paddingHorizontal: 16, paddingTop: 10, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
});
