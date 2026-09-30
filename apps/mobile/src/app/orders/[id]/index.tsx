import { ApiError } from '@shop/api-client';
import { type OrderDetailDto, type PaymentMethod, type ServerToClientEvents } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { AddressPicker } from '@/components/order/address-list';
import {
  AddressText,
  AmountSummary,
  carrierLabel,
  OrderItemRow,
  OrderStatusBadge,
  OrderSteps,
  payMethods,
} from '@/components/order/order-ui';
import { ReasonSheet, ShipSheet } from '@/components/order/sheets';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RadioList } from '@/components/ui/radio';
import { Empty, Loading, RefreshSkeleton } from '@/components/ui/state';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Text } from '@/components/ui/text';
import i18n, { currentLanguage, LOCALE } from '@/i18n';
import { formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { BridgeCancelled, payOrder } from '@/lib/bridge';
import { getRealtime } from '@/lib/realtime';
import { useTheme } from '@/theme';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE[currentLanguage()], {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : i18n.t('common:state.actionFailed');
const confirmThen = (title: string, message: string, confirmLabel: string, fn: () => void) =>
  Alert.alert(title, message, [
    { text: i18n.t('common:action.cancel'), style: 'cancel' },
    { text: confirmLabel, onPress: fn },
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

function Info({ name, children }: { name: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="small" color="muted" style={{ width: 88 }}>
        {name}
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
  const { t: tr } = useTranslation(['order', 'common']);
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
      Alert.alert(tr('pay.done'));
    } catch (e) {
      if (!(e instanceof BridgeCancelled)) Alert.alert(tr('pay.failed'), errMsg(e));
    } finally {
      setPaying(false);
      refresh();
    }
  };

  if (va)
    return (
      <View style={[styles.box, { borderColor: t.colors.warning }]}>
        <Text variant="bodyStrong">{tr('pending.waitingDeposit')}</Text>
        <Info name={tr('pending.depositAccount')}>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={tr('pending.copyAccountHint')}
            onPress={() =>
              void Clipboard.setStringAsync(va.accountNumber).then(() =>
                Alert.alert(tr('pending.accountCopied')),
              )
            }
          >
            <Text variant="small">
              {va.bank} {va.accountNumber}{' '}
              <Text variant="small" color="primary">
                {tr('common:action.copy')}
              </Text>
            </Text>
          </Pressable>
        </Info>
        <Info name={tr('pending.holder')}>{va.holder}</Info>
        <Info name={tr('pending.depositAmount')}>{formatPrice(o.totalAmount)}</Info>
        <Info name={tr('pending.depositDue')}>{dateTime(va.dueDate)}</Info>
        {o.payment?.provider === 'mock' && (
          <Button
            title={tr('pending.mockDeposit')}
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
      <Text variant="bodyStrong">{tr('pending.completePayment')}</Text>
      {o.paymentDueAt && (
        <Text variant="small" color="muted">
          {tr('pending.autoCancel', { date: dateTime(o.paymentDueAt) })}
          {o.source === 'AUCTION' && tr('pending.auctionPenalty')}
        </Text>
      )}
      <View style={styles.row}>
        <Text variant="label" style={{ flex: 1 }}>
          {tr('pending.address')}
        </Text>
        {o.shippingAddress && (
          <Button
            title={changeAddress ? tr('pending.useSavedAddress') : tr('pending.change')}
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
      <Text variant="label">{tr('detail.payMethod')}</Text>
      <RadioList label={tr('detail.payMethod')} value={method} onChange={setMethod} options={payMethods()} />
      <Button
        title={tr('pay.buttonAmount', { amount: formatPrice(o.totalAmount) })}
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
  const { t: tr } = useTranslation(['order', 'common']);
  const [sheet, setSheet] = useState<Sheet>(null);
  const run = useMutation({
    mutationFn: (fn: () => Promise<OrderDetailDto>) => fn(),
    onSuccess: (next) => {
      setSheet(null);
      Alert.alert(tr('detail.statusChanged', { status: label('orderStatus', next.status) }));
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
        title={tr('action.confirmPurchase')}
        loading={run.isPending}
        onPress={() =>
          confirmThen(
            tr('action.confirmTitle'),
            tr('action.confirmMessage'),
            tr('action.confirmPurchase'),
            () => run.mutate(() => api.orders.confirm(o.id)),
          )
        }
      />,
    );
  if (buyer && s === 'DELIVERED')
    buttons.push(
      <Button
        key="refund"
        title={tr('action.requestRefund')}
        variant="outline"
        onPress={() => setSheet('refund')}
      />,
    );
  if (seller && s === 'PAID')
    buttons.push(
      <Button
        key="prepare"
        title={tr('action.markPreparing')}
        variant="outline"
        loading={run.isPending}
        onPress={() => run.mutate(() => api.orders.prepare(o.id))}
      />,
    );
  if (seller && (s === 'PAID' || s === 'PREPARING'))
    buttons.push(<Button key="ship" title={tr('action.ship')} onPress={() => setSheet('ship')} />);
  if (seller && s === 'SHIPPED')
    buttons.push(
      <Button
        key="deliver"
        title={tr('action.markDelivered')}
        loading={run.isPending}
        onPress={() => run.mutate(() => api.orders.deliver(o.id))}
      />,
      <Button
        key="reship"
        title={tr('action.editTracking')}
        variant="outline"
        onPress={() => setSheet('reship')}
      />,
    );
  if (seller && s === 'REFUND_REQUESTED')
    buttons.push(
      <Button
        key="approve"
        title={tr('action.approveRefund')}
        loading={run.isPending}
        onPress={() =>
          confirmThen(
            tr('action.approveTitle'),
            tr('action.approveMessage'),
            tr('action.approveRefund'),
            () => run.mutate(() => api.orders.refundApprove(o.id)),
          )
        }
      />,
      <Button
        key="reject"
        title={tr('action.rejectRefund')}
        variant="outline"
        onPress={() => setSheet('reject')}
      />,
    );
  if (canCancel)
    buttons.push(
      <Button
        key="cancel"
        title={tr('action.cancelOrder')}
        variant="ghost"
        onPress={() => setSheet('cancel')}
      />,
    );
  if (!buttons.length) return null;

  return (
    <View style={{ gap: 8 }}>
      {buttons}
      {sheet === 'cancel' && (
        <ReasonSheet
          title={tr('action.cancelTitle')}
          description={s !== 'PAYMENT_PENDING' ? tr('action.cancelRefundNotice') : undefined}
          confirmLabel={tr('action.cancelOrder')}
          destructive
          pending={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(r) => run.mutate(() => api.orders.cancel(o.id, r))}
        />
      )}
      {sheet === 'refund' && (
        <ReasonSheet
          title={tr('action.requestRefund')}
          description={tr('action.refundDescription')}
          confirmLabel={tr('action.requestRefund')}
          minLength={5}
          pending={run.isPending}
          onClose={() => setSheet(null)}
          onSubmit={(r) => run.mutate(() => api.orders.refundRequest(o.id, r))}
        />
      )}
      {sheet === 'reject' && (
        <ReasonSheet
          title={tr('action.rejectRefund')}
          description={tr('action.rejectDescription')}
          confirmLabel={tr('action.reject')}
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
  const { t: tr } = useTranslation(['order', 'common']);
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
    if (paid) Alert.alert(i18n.t('order:pay.done'));
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
  if (!o) return <Empty kind="notfound" title={tr('detail.notFound')} description={errMsg(q.error)} />;
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
      <Stack.Screen options={{ title: tr('detail.title') }} />
      <RefreshSkeleton refreshing={pull.refreshing} variant="text">
        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            <OrderStatusBadge status={o.status} />
            {o.source === 'AUCTION' && (
              <Text variant="small" color="muted">
                {tr('detail.auctionWon')}
              </Text>
            )}
          </View>
          <Text variant="small" color="muted" selectable>
            {tr('detail.orderNumber', { number: o.orderNumber, date: dateTime(o.createdAt) })}
          </Text>
          <OrderSteps status={o.status} />
        </View>

        {o.status === 'PAYMENT_PENDING' && o.role === 'buyer' && <PendingPayment o={o} refresh={refresh} />}
        {o.status === 'CANCELLED' && (
          <View style={[styles.box, { borderColor: t.colors.border }]}>
            <Text variant="bodyStrong">{tr('detail.cancelled')}</Text>
            <Text variant="small" color="muted">
              {o.cancelReason}
              {o.cancelledAt && ` · ${dateTime(o.cancelledAt)}`}
            </Text>
          </View>
        )}
        {o.status === 'REFUND_REQUESTED' && (
          <View style={[styles.box, { borderColor: t.colors.warning }]}>
            <Text variant="bodyStrong">{tr('detail.refundRequested')}</Text>
            <Text variant="small">{o.refundReason}</Text>
          </View>
        )}
        {o.autoConfirmAt && o.role === 'buyer' && (
          <Text variant="small" color="muted">
            {tr('detail.autoConfirm', { date: dateTime(o.autoConfirmAt) })}
          </Text>
        )}

        <Actions o={o} refresh={refresh} />
        {o.status === 'COMPLETED' && o.role !== 'admin' && (
          <Button
            title={
              o.reviewed ? tr('detail.myReview') : tr('detail.writeReview', { name: counterpart.nickname })
            }
            variant={o.reviewed ? 'outline' : 'primary'}
            onPress={() => router.push({ pathname: '/orders/[id]/review', params: { id: o.id } })}
          />
        )}
        {o.role === 'buyer' && o.items[0] && (
          <Button
            title={tr('detail.chatSeller')}
            variant="outline"
            size="sm"
            onPress={() => void openChat()}
          />
        )}

        <Block
          title={tr('detail.items')}
          action={
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/users/[id]', params: { id: counterpart.id } })}
              style={styles.row}
            >
              <Avatar avatarKey={counterpart.avatarKey} name={counterpart.nickname} size={24} />
              <Text variant="small">
                {o.role === 'buyer' ? tr('role.seller') : tr('role.buyer')} {counterpart.nickname}
              </Text>
            </Pressable>
          }
        >
          {o.items.map((i) => (
            <OrderItemRow key={i.productId} item={i} />
          ))}
        </Block>

        {o.shipment && (
          <Block title={tr('detail.shipping')}>
            <Text selectable>
              {carrierLabel(o.shipment.carrier)} {o.shipment.trackingNumber}
            </Text>
            {o.shipment.shippedAt && (
              <Text variant="small" color="muted">
                {tr('detail.shippedAt', { date: dateTime(o.shipment.shippedAt) })}
              </Text>
            )}
            {o.shipment.trackingUrl && (
              <Button
                title={tr('detail.trackShipment')}
                variant="outline"
                size="sm"
                onPress={() => void WebBrowser.openBrowserAsync(o.shipment!.trackingUrl!)}
              />
            )}
          </Block>
        )}

        {o.shippingAddress && (
          <Block title={tr('detail.address')}>
            <AddressText a={o.shippingAddress} />
          </Block>
        )}

        <Block title={tr('detail.payment')}>
          <AmountSummary q={o} />
          {pay && pay.status !== 'READY' && pay.status !== 'FAILED' && (
            <View style={{ gap: 4, marginTop: 6 }}>
              <Info name={tr('detail.payMethod')}>{label('paymentMethod', pay.method)}</Info>
              {pay.approvedAt && <Info name={tr('detail.paidAt')}>{dateTime(pay.approvedAt)}</Info>}
              {pay.cancelledAmount > 0 && (
                <Info name={tr('detail.refund')}>{formatPrice(pay.cancelledAmount)}</Info>
              )}
            </View>
          )}
          {pay?.receiptUrl && (
            <Button
              title={tr('detail.receipt')}
              variant="ghost"
              size="sm"
              onPress={() => void WebBrowser.openBrowserAsync(pay.receiptUrl!)}
            />
          )}
        </Block>

        <Block title={tr('detail.history')}>
          {[...o.logs].reverse().map((l, i) => (
            <View key={i} style={styles.row}>
              <Text variant="caption" color="muted" style={{ width: 110 }}>
                {dateTime(l.createdAt)}
              </Text>
              <Text variant="small" style={{ flex: 1 }}>
                <Text variant="small" style={{ fontWeight: '600' }}>
                  {label('orderStatus', l.to)}
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
