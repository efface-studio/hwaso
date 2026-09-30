import {
  CARRIERS,
  type OrderItemDto,
  type OrderQuoteDto,
  type OrderStatus,
  type PaymentMethod,
  type ShippingAddress,
} from '@shop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { mediaUrl } from '@/lib/media';
import { useTheme, type Colors } from '@/theme';

/** 결제 수단 선택지 — 부를 때의 언어로 만든다 */
export const payMethods = (): { value: PaymentMethod; label: string; description?: string }[] => [
  {
    value: 'CARD',
    label: i18n.t('order:payMethod.card.label'),
    description: i18n.t('order:payMethod.card.description'),
  },
  { value: 'EASY_PAY', label: i18n.t('order:payMethod.easyPay.label') },
  {
    value: 'BANK_TRANSFER',
    label: i18n.t('order:payMethod.bankTransfer.label'),
    description: i18n.t('order:payMethod.bankTransfer.description'),
  },
  {
    value: 'VIRTUAL_ACCOUNT',
    label: i18n.t('order:payMethod.virtualAccount.label'),
    description: i18n.t('order:payMethod.virtualAccount.description'),
  },
];

/** CARRIERS 순서와 같은 번역 키 (택배사 이름은 서버에 원문 그대로 저장된다) */
const CARRIER_KEYS = ['cj', 'epost', 'hanjin', 'lotte', 'logen', 'artShipping', 'handDelivery'] as const;

/** 택배사 이름(원문) → 지금 언어의 표시 이름. 목록에 없는 이름은 그대로 */
export function carrierLabel(name: string): string {
  const key = CARRIER_KEYS[CARRIERS.findIndex((c) => c.name === name)];
  return key ? i18n.t(`order:carrier.${key}`) : name;
}

const TONE: Record<OrderStatus, keyof Colors> = {
  PENDING: 'muted',
  PAYMENT_PENDING: 'destructive',
  PAID: 'primary',
  PREPARING: 'primary',
  SHIPPED: 'primary',
  DELIVERED: 'primary',
  COMPLETED: 'foreground2',
  CANCELLED: 'muted',
  REFUND_REQUESTED: 'destructive',
  REFUNDED: 'muted',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTheme();
  useTranslation();
  return (
    <View style={[styles.badge, { borderColor: t.colors[TONE[status]] }]}>
      <Text variant="caption" color={TONE[status]} style={{ fontWeight: '600' }}>
        {label('orderStatus', status)}
      </Text>
    </View>
  );
}

/** 결제 완료 → 배송 준비 → 배송 중 → 배송 완료 → 구매 확정 */
const STEPS: OrderStatus[] = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];

export function OrderSteps({ status }: { status: OrderStatus }) {
  const t = useTheme();
  const { t: tr } = useTranslation('order');
  const at = STEPS.indexOf(status === 'REFUND_REQUESTED' ? 'DELIVERED' : status);
  if (at < 0) return null;
  return (
    <View
      style={styles.steps}
      accessibilityLabel={tr('steps.a11y', {
        step: at + 1,
        total: STEPS.length,
        label: label('orderStatus', STEPS[at]!),
      })}
    >
      {STEPS.map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 4 }}>
          <View style={[styles.bar, { backgroundColor: i <= at ? t.colors.primary : t.colors.surface2 }]} />
          <Text variant="caption" color={i === at ? 'foreground' : 'muted'} numberOfLines={1}>
            {label('orderStatus', s)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** compact 는 목록 카드 안에서 쓰므로 작품으로 가는 링크를 두지 않는다 (카드 전체가 주문 링크) */
export function OrderItemRow({ item, compact }: { item: OrderItemDto; compact?: boolean }) {
  const t = useTheme();
  useTranslation();
  const size = compact ? 56 : 72;
  return (
    <Pressable
      accessibilityRole={compact ? undefined : 'link'}
      disabled={compact}
      onPress={() => router.push({ pathname: '/products/[id]', params: { id: item.productId } })}
      style={styles.item}
    >
      <View style={{ width: size, height: size, backgroundColor: t.colors.backgroundSoft }}>
        {item.image && (
          <Image
            source={mediaUrl(item.image.key, 400)}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2}>{item.title}</Text>
        <Text variant="small" color="muted">
          {formatPrice(item.unitPrice)}
          {item.quantity > 1 && ` × ${item.quantity}`}
        </Text>
      </View>
    </Pressable>
  );
}

export function AmountSummary({
  q,
}: {
  q: Pick<OrderQuoteDto, 'itemsAmount' | 'shippingFee' | 'discountAmount' | 'totalAmount'>;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('order');
  const row = (name: string, v: string, strong?: boolean) => (
    <View style={styles.amount}>
      <Text variant={strong ? 'bodyStrong' : 'small'} color={strong ? 'foreground' : 'muted'}>
        {name}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'small'}>{v}</Text>
    </View>
  );
  return (
    <View style={{ gap: 6 }}>
      {row(tr('amount.items'), formatPrice(q.itemsAmount))}
      {row(tr('amount.shipping'), q.shippingFee ? formatPrice(q.shippingFee) : tr('amount.free'))}
      {q.discountAmount > 0 && row(tr('amount.coupon'), `−${formatPrice(q.discountAmount)}`)}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }} />
      {row(tr('amount.total'), formatPrice(q.totalAmount), true)}
    </View>
  );
}

const phoneText = (p: string) => p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');

export function AddressText({ a }: { a: ShippingAddress }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="bodyStrong">
        {a.recipient}{' '}
        <Text variant="small" color="muted">
          {phoneText(a.phone)}
        </Text>
      </Text>
      <Text variant="small">
        [{a.zipCode}] {a.address1} {a.address2}
      </Text>
      {a.memo ? (
        <Text variant="small" color="muted">
          {a.memo}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  steps: { flexDirection: 'row', gap: 4 },
  bar: { height: 4, borderRadius: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { flexDirection: 'row', justifyContent: 'space-between' },
});
