import {
  ORDER_STATUS_LABEL,
  formatPrice,
  type OrderItemDto,
  type OrderQuoteDto,
  type OrderStatus,
  type PaymentMethod,
  type ShippingAddress,
} from '@shop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { mediaUrl } from '@/lib/media';
import { useTheme, type Colors } from '@/theme';

export const PAY_METHODS: { value: PaymentMethod; label: string; description?: string }[] = [
  { value: 'CARD', label: '신용·체크카드', description: '할부·카드사 간편결제 포함' },
  { value: 'EASY_PAY', label: '토스페이' },
  { value: 'BANK_TRANSFER', label: '계좌이체', description: '실시간 계좌이체' },
  {
    value: 'VIRTUAL_ACCOUNT',
    label: '무통장입금 (가상계좌)',
    description: '고액 작품에 적합해요. 입금 기한 안에 입금하면 결제가 완료돼요.',
  },
];

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
  return (
    <View style={[styles.badge, { borderColor: t.colors[TONE[status]] }]}>
      <Text variant="caption" color={TONE[status]} style={{ fontWeight: '600' }}>
        {ORDER_STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

/** 결제 완료 → 배송 준비 → 배송 중 → 배송 완료 → 구매 확정 */
const STEPS: OrderStatus[] = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];

export function OrderSteps({ status }: { status: OrderStatus }) {
  const t = useTheme();
  const at = STEPS.indexOf(status === 'REFUND_REQUESTED' ? 'DELIVERED' : status);
  if (at < 0) return null;
  return (
    <View
      style={styles.steps}
      accessibilityLabel={`주문 진행 ${at + 1}/${STEPS.length} 단계: ${ORDER_STATUS_LABEL[STEPS[at]!]}`}
    >
      {STEPS.map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 4 }}>
          <View style={[styles.bar, { backgroundColor: i <= at ? t.colors.primary : t.colors.surface2 }]} />
          <Text variant="caption" color={i === at ? 'foreground' : 'muted'} numberOfLines={1}>
            {ORDER_STATUS_LABEL[s]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** compact 는 목록 카드 안에서 쓰므로 작품으로 가는 링크를 두지 않는다 (카드 전체가 주문 링크) */
export function OrderItemRow({ item, compact }: { item: OrderItemDto; compact?: boolean }) {
  const t = useTheme();
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
  const row = (label: string, v: string, strong?: boolean) => (
    <View style={styles.amount}>
      <Text variant={strong ? 'bodyStrong' : 'small'} color={strong ? 'foreground' : 'muted'}>
        {label}
      </Text>
      <Text variant={strong ? 'bodyStrong' : 'small'}>{v}</Text>
    </View>
  );
  return (
    <View style={{ gap: 6 }}>
      {row('작품 금액', formatPrice(q.itemsAmount))}
      {row('배송비', q.shippingFee ? formatPrice(q.shippingFee) : '무료')}
      {q.discountAmount > 0 && row('쿠폰 할인', `−${formatPrice(q.discountAmount)}`)}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }} />
      {row('총 결제 금액', formatPrice(q.totalAmount), true)}
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
