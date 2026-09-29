import { ApiError } from '@shop/api-client';
import {
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  formatPrice,
  type OrderDetailDto,
  type PaymentMethod,
  type ServerToClientEvents,
} from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { AddressPicker } from '@/components/order/address-list';
import {
  AddressText,
  AmountSummary,
  OrderItemRow,
  OrderStatusBadge,
  OrderSteps,
  PAY_METHODS,
} from '@/components/order/order-ui';
import { ReasonSheet, ShipSheet } from '@/components/order/sheets';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RadioList } from '@/components/ui/radio';
import { Empty, Loading, RefreshSkeleton } from '@/components/ui/state';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { BridgeCancelled, payOrder } from '@/lib/bridge';
import { getRealtime } from '@/lib/realtime';
import { useTheme } from '@/theme';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : '처리하지 못했어요.';
const confirmThen = (title: string, message: string, label: string, fn: () => void) =>
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: label, onPress: fn },
  ]);

function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.block, { borderColor: t.colors.border }]}>
      <View style={styles.row}>
        <Text variant="h3" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="small" color="muted" style={{ width: 88 }}>
        {label}
      </Text>
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? <Text variant="small">{children}</Text> : children}
      </View>
    </View>
  );
}

/** 결제 대기: 배송지·결제 수단을 고르고 결제 (낙찰 주문 포함). 가상계좌 발급 후에는 입금 안내 */
function PendingPayment({ o, refresh }: { o: OrderDetailDto; refresh: () => void }) {
  const t = useTheme();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [changeAddress, setChangeAddress] = useState(!o.shippingAddress);
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [paying, setPaying] = useState(false);
  const va = o.payment?.virtualAccount;
  const deposit = useMutation({
    mutationFn: () => api.orders.mockDeposit(o.payment!.id),
    onSuccess: () => refresh(),
    onError: (e) => Alert.alert(errMsg(e)),
  });
  const pay = async () => {
    setPaying(true);
    try {
      await payOrder(o.id, method, changeAddress ? (addressId ?? undefined) : undefined);
      Alert.alert('결제가 완료되었어요');
    } catch (e) {
      if (!(e instanceof BridgeCancelled)) Alert.alert('결제하지 못했어요', errMsg(e));
    } finally {
      setPaying(false);
      refresh();
    }
  };

  if (va)
    return (
      <View style={[styles.box, { borderColor: t.colors.warning }]}>
        <Text variant="bodyStrong">입금을 기다리고 있어요</Text>
        <Info label="입금 계좌">
          <Pressable
            accessibilityRole="button"
            accessibilityHint="눌러서 계좌번호 복사"
            onPress={() =>
              void Clipboard.setStringAsync(va.accountNumber).then(() => Alert.alert('계좌번호를 복사했어요'))
            }
          >
            <Text variant="small">
              {va.bank} {va.accountNumber}{' '}
              <Text variant="small" color="primary">
                복사
              </Text>
            </Text>
          </Pressable>
        </Info>
        <Info label="예금주">{va.holder}</Info>
        <Info label="입금 금액">{formatPrice(o.totalAmount)}</Info>
        <Info label="입금 기한">{dateTime(va.dueDate)}</Info>
        {o.payment?.provider === 'mock' && (
          <Button
            title="모의 입금하기 (개발용)"
            size="sm"
            variant="outline"
            loading={deposit.isPending}
            onPress={() => deposit.mutate()}
          />
        )}
      </View>
    );

  return (
    <View style={[styles.box, { borderColor: t.colors.primary }]}>
      <Text variant="bodyStrong">결제를 완료해주세요</Text>
      {o.paymentDueAt && (
        <Text variant="small" color="muted">
          {dateTime(o.paymentDueAt)}까지 결제하지 않으면 주문이 자동 취소돼요.
          {o.source === 'AUCTION' && ' 낙찰 후 미결제는 경매 참여 제한 사유가 됩니다.'}
        </Text>
      )}
      <View style={styles.row}>
        <Text variant="label" style={{ flex: 1 }}>
          배송지
        </Text>
        {o.shippingAddress && (
          <Button
            title={changeAddress ? '기존 배송지 사용' : '변경'}
            size="sm"
            variant="ghost"
            onPress={() => setChangeAddress((v) => !v)}
          />
        )}
      </View>
      {changeAddress ? (
        <AddressPicker selected={addressId} onSelect={setAddressId} />
      ) : (
        o.shippingAddress && <AddressText a={o.shippingAddress} />
      )}
      <Text variant="label">결제 수단</Text>
      <RadioList label="결제 수단" value={method} onChange={setMethod} options={PAY_METHODS} />
      <Button
        title={`${formatPrice(o.totalAmount)} 결제하기`}
        size="lg"
        loading={paying}
        disabled={changeAddress && !addressId}
        onPress={() => void pay()}
      />
    </View>
  );
}

type Sheet = 'cancel' | 'refund' | 'reject' | 'ship' | 'reship' | null;

function Actions({ o, refresh }: { o: OrderDetailDto; refresh: (next?: OrderDetailDto) => void }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const run = useMutation({
    mutationFn: (fn: () => Promise<OrderDetailDto>) => fn(),
    onSuccess: (next) => {
      setSheet(null);
      Alert.alert(`${ORDER_STATUS_LABEL[next.status]} 상태가 되었어요`);
      refresh(next);
    },
    onError: (e) => Alert.alert(errMsg(e)),
  });
  const buyer = o.role === 'buyer';
  const seller = !buyer;
  const s = o.status;
  const canCancel = buyer
    ? s === 'PAYMENT_PENDING' || (s === 'PAID' && o.source === 'DIRECT')
    : ['PAID', 'PREPARING'].includes(s) ||
      (s === 'PAYMENT_PENDING' && (o.source === 'DIRECT' || o.role === 'admin'));

  const buttons: ReactNode[] = [];
  if (buyer && (s === 'SHIPPED' || s === 'DELIVERED'))
    buttons.push(
      <Button
        key="confirm"
        title="구매 확정"
        loading={run.isPending}
        onPress={() =>
          confirmThen(
            '작품을 잘 받으셨나요?',
            '구매를 확정하면 판매자에게 대금이 정산되고 환불을 요청할 수 없어요.',
            '구매 확정',
            () => run.mutate(() => api.orders.confirm(o.id)),
          )
        }
      />,
    );
  if (buyer && s === 'DELIVERED')
    buttons.push(
      <Button key="refund" title="환불 요청" variant="outline" onPress={() => setSheet('refund')} />,
    );
  if (seller && s === 'PAID')
    buttons.push(
      <Button
        key="prepare"
        title="발송 준비 중으로 변경"
        variant="outline"
        loading={run.isPending}
        onPress={() => run.mutate(() => api.orders.prepare(o.id))}
      />,
    );
  if (seller && (s === 'PAID' || s === 'PREPARING'))
    buttons.push(<Button key="ship" title="발송 처리" onPress={() => setSheet('ship')} />);
  if (seller && s === 'SHIPPED')
    buttons.push(
      <Button
        key="deliver"
        title="배송 완료 처리"
        loading={run.isPending}
        onPress={() => run.mutate(() => api.orders.deliver(o.id))}
      />,
      <Button key="reship" title="송장 수정" variant="outline" onPress={() => setSheet('reship')} />,
    );
  if (seller && s === 'REFUND_REQUESTED')
    buttons.push(
      <Button
        key="approve"
        title="환불 승인"
        loading={run.isPending}
        onPress={() =>
          confirmThen(
            '환불을 승인할까요?',
            '결제 금액 전액이 구매자에게 환불되고 작품은 판매 중지 상태가 돼요.',
            '환불 승인',
            () => run.mutate(() => api.orders.refundApprove(o.id)),
          )
        }
      />,
      <Button key="reject" title="환불 거절" variant="outline" onPress={() => setSheet('reject')} />,
    );
  if (canCancel)
    buttons.push(
      <Button key="cancel" title="주문 취소" variant="ghost" onPress={() => setSheet('cancel')} />,
    );
  if (!buttons.length) return null;

  return (
    <View style={{ gap: 8 }}>
      {buttons}
      {sheet === 'cancel' && (
        <ReasonSheet
          title="주문을 취소할까요?"
          description={s !== 'PAYMENT_PENDING' ? '결제 금액 전액이 원래 결제 수단으로 환불돼요.' : undefined}
          confirmLabel="주문 취소"
          destructive
          pending={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(r) => run.mutate(() => api.orders.cancel(o.id, r))}
        />
      )}
      {sheet === 'refund' && (
        <ReasonSheet
          title="환불 요청"
          description="판매자가 확인 후 승인하면 전액 환불돼요. 파손·상품 정보와 다른 점을 구체적으로 적어주세요."
          confirmLabel="환불 요청"
          minLength={5}
          pending={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(r) => run.mutate(() => api.orders.refundRequest(o.id, r))}
        />
      )}
      {sheet === 'reject' && (
        <ReasonSheet
          title="환불 거절"
          description="거절 사유가 구매자에게 안내되며, 구매자는 고객센터에 조정을 요청할 수 있어요."
          confirmLabel="거절"
          destructive
          pending={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(r) => run.mutate(() => api.orders.refundReject(o.id, r))}
        />
      )}
      {(sheet === 'ship' || sheet === 'reship') && (
        <ShipSheet
          initial={sheet === 'reship' && o.shipment ? o.shipment : undefined}
          pending={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(v) =>
            run.mutate(() =>
              sheet === 'ship' ? api.orders.ship(o.id, v) : api.orders.updateShipment(o.id, v),
            )
          }
        />
      )}
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id, paid } = useLocalSearchParams<{ id: string; paid?: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const key = ['order', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.orders.detail(id) });
  const pull = usePullRefresh(q.refetch);
  const refresh = (next?: OrderDetailDto) => {
    if (next) qc.setQueryData(key, next);
    void qc.invalidateQueries({ queryKey: ['order', id] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };

  useEffect(() => {
    if (paid) Alert.alert('결제가 완료되었어요');
  }, [paid]);
  // 상대방·워커가 상태를 바꾸면 바로 반영
  useEffect(() => {
    const socket = getRealtime();
    const on: ServerToClientEvents['ORDER_STATUS_UPDATED'] = (p) =>
      p.orderId === id && void qc.invalidateQueries({ queryKey: ['order', id] });
    socket.on('ORDER_STATUS_UPDATED', on);
    return () => void socket.off('ORDER_STATUS_UPDATED', on);
  }, [id, qc]);

  if (q.isPending) return <Loading variant="text" />;
  const o = q.data;
  if (!o) return <Empty kind="notfound" title="주문을 찾을 수 없어요" description={errMsg(q.error)} />;
  const counterpart = o.role === 'buyer' ? o.seller : o.buyer;
  const pay = o.payment;
  const openChat = async () => {
    try {
      const { id: roomId } = await api.chat.open(o.items[0]!.productId);
      router.push({ pathname: '/chat/[id]', params: { id: roomId } });
    } catch (e) {
      Alert.alert(errMsg(e));
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Stack.Screen options={{ title: '주문 상세' }} />
      <RefreshSkeleton refreshing={pull.refreshing} variant="text">
        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            <OrderStatusBadge status={o.status} />
            {o.source === 'AUCTION' && (
              <Text variant="small" color="muted">
                경매 낙찰
              </Text>
            )}
          </View>
          <Text variant="small" color="muted" selectable>
            주문번호 {o.orderNumber} · {dateTime(o.createdAt)}
          </Text>
          <OrderSteps status={o.status} />
        </View>

        {o.status === 'PAYMENT_PENDING' && o.role === 'buyer' && <PendingPayment o={o} refresh={refresh} />}
        {o.status === 'CANCELLED' && (
          <View style={[styles.box, { borderColor: t.colors.border }]}>
            <Text variant="bodyStrong">취소된 주문이에요</Text>
            <Text variant="small" color="muted">
              {o.cancelReason}
              {o.cancelledAt && ` · ${dateTime(o.cancelledAt)}`}
            </Text>
          </View>
        )}
        {o.status === 'REFUND_REQUESTED' && (
          <View style={[styles.box, { borderColor: t.colors.warning }]}>
            <Text variant="bodyStrong">환불 요청 중</Text>
            <Text variant="small">{o.refundReason}</Text>
          </View>
        )}
        {o.autoConfirmAt && o.role === 'buyer' && (
          <Text variant="small" color="muted">
            {dateTime(o.autoConfirmAt)}에 자동으로 구매 확정돼요.
          </Text>
        )}

        <Actions o={o} refresh={refresh} />
        {o.status === 'COMPLETED' && o.role !== 'admin' && (
          <Button
            title={o.reviewed ? '내 후기 보기·수정' : `${counterpart.nickname}님과의 거래 후기 쓰기`}
            variant={o.reviewed ? 'outline' : 'primary'}
            onPress={() => router.push({ pathname: '/orders/[id]/review', params: { id: o.id } })}
          />
        )}
        {o.role === 'buyer' && o.items[0] && (
          <Button title="판매자와 채팅" variant="outline" size="sm" onPress={() => void openChat()} />
        )}

        <Block
          title="주문 작품"
          action={
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/users/[id]', params: { id: counterpart.id } })}
              style={styles.row}
            >
              <Avatar avatarKey={counterpart.avatarKey} name={counterpart.nickname} size={24} />
              <Text variant="small">
                {o.role === 'buyer' ? '판매자' : '구매자'} {counterpart.nickname}
              </Text>
            </Pressable>
          }
        >
          {o.items.map((i) => (
            <OrderItemRow key={i.productId} item={i} />
          ))}
        </Block>

        {o.shipment && (
          <Block title="배송">
            <Text selectable>
              {o.shipment.carrier} {o.shipment.trackingNumber}
            </Text>
            {o.shipment.shippedAt && (
              <Text variant="small" color="muted">
                발송 {dateTime(o.shipment.shippedAt)}
              </Text>
            )}
            {o.shipment.trackingUrl && (
              <Button
                title="배송 조회"
                variant="outline"
                size="sm"
                onPress={() => void WebBrowser.openBrowserAsync(o.shipment!.trackingUrl!)}
              />
            )}
          </Block>
        )}

        {o.shippingAddress && (
          <Block title="배송지">
            <AddressText a={o.shippingAddress} />
          </Block>
        )}

        <Block title="결제">
          <AmountSummary q={o} />
          {pay && pay.status !== 'READY' && pay.status !== 'FAILED' && (
            <View style={{ gap: 4, marginTop: 6 }}>
              <Info label="결제 수단">{PAYMENT_METHOD_LABEL[pay.method]}</Info>
              {pay.approvedAt && <Info label="결제 일시">{dateTime(pay.approvedAt)}</Info>}
              {pay.cancelledAmount > 0 && <Info label="환불">{formatPrice(pay.cancelledAmount)}</Info>}
            </View>
          )}
          {pay?.receiptUrl && (
            <Button
              title="영수증 보기"
              variant="ghost"
              size="sm"
              onPress={() => void WebBrowser.openBrowserAsync(pay.receiptUrl!)}
            />
          )}
        </Block>

        <Block title="진행 기록">
          {[...o.logs].reverse().map((l, i) => (
            <View key={i} style={styles.row}>
              <Text variant="caption" color="muted" style={{ width: 110 }}>
                {dateTime(l.createdAt)}
              </Text>
              <Text variant="small" style={{ flex: 1 }}>
                <Text variant="small" style={{ fontWeight: '600' }}>
                  {ORDER_STATUS_LABEL[l.to]}
                </Text>
                {l.reason ? ` · ${l.reason}` : ''}
              </Text>
            </View>
          ))}
        </Block>
      </RefreshSkeleton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  block: { paddingTop: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  box: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 },
});
