'use client';

import { ApiError } from '@shop/api-client';
import {
  CARRIERS,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  formatPrice,
  type OrderDetailDto,
  type PaymentMethod,
} from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { getRealtime } from '@/lib/realtime';
import { toast } from '@/stores/toast';
import { StartChatButton } from '@/components/chat/start-chat';
import { AddressList, AddressText } from './address';
import { AmountSummary, OrderItemRow, OrderStatusBadge, OrderSteps } from './order-ui';
import { PayMethodPicker, usePay } from './pay';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했습니다.');

function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-h3">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 사유 입력 확인창 (취소·환불 요청·환불 거절 공용) */
function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  minLength = 1,
  destructive,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  minLength?: number;
  destructive?: boolean;
  pending: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            disabled={reason.trim().length < minLength}
            loading={pending}
            onClick={() => onSubmit(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="사유" required hint={minLength > 1 ? `${minLength}자 이상 입력해주세요.` : undefined}>
        {(p) => (
          <Textarea {...p} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </Field>
    </Dialog>
  );
}

function ShipDialog({
  open,
  onOpenChange,
  initial,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: { carrier: string; trackingNumber: string | null };
  pending: boolean;
  onSubmit: (v: { carrier: string; trackingNumber: string }) => void;
}) {
  const [carrier, setCarrier] = useState(initial?.carrier ?? CARRIERS[0].name);
  const [tracking, setTracking] = useState(initial?.trackingNumber ?? '');
  const noTracking = CARRIERS.find((c) => c.name === carrier)?.url === null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? '송장 정보 수정' : '발송 처리'}
      description="구매자에게 배송 조회 링크와 함께 안내돼요."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            loading={pending}
            disabled={tracking.trim().length < 4}
            onClick={() => onSubmit({ carrier, trackingNumber: tracking.trim() })}
          >
            {initial ? '수정' : '발송 완료'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="택배사" required>
          {(p) => (
            <Select
              {...p}
              value={carrier}
              onValueChange={setCarrier}
              options={CARRIERS.map((c) => ({ value: c.name, label: c.name }))}
            />
          )}
        </Field>
        <Field
          label={noTracking ? '운송장·접수 번호 (또는 연락처)' : '운송장 번호'}
          required
          hint={noTracking ? '전문 운송·직접 전달은 예약 번호나 연락처 뒷자리를 적어주세요.' : undefined}
        >
          {(p) => (
            <Input
              {...p}
              inputMode={noTracking ? 'text' : 'numeric'}
              maxLength={50}
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** 결제 대기: 배송지·결제 수단을 고르고 결제 (낙찰 주문 포함). 가상계좌 발급 후에는 입금 안내 */
function PendingPayment({ o, refresh }: { o: OrderDetailDto; refresh: () => void }) {
  const [addressId, setAddressId] = useState<string | null>(null);
  const [changeAddress, setChangeAddress] = useState(!o.shippingAddress);
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const { pay, paying } = usePay();
  const va = o.payment?.virtualAccount;
  const deposit = useMutation({
    mutationFn: () => api.orders.mockDeposit(o.payment!.id),
    onSuccess: () => {
      toast.success('모의 입금을 완료했어요');
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (va) {
    return (
      <Alert tone="warning" title="입금을 기다리고 있어요">
        <dl className="mt-2 grid grid-cols-[88px_1fr] gap-y-1 text-small">
          <dt className="text-muted">입금 계좌</dt>
          <dd className="flex items-center gap-1">
            <span className="tabular">
              {va.bank} {va.accountNumber}
            </span>
            <button
              type="button"
              aria-label="계좌번호 복사"
              onClick={() =>
                void navigator.clipboard
                  .writeText(va.accountNumber)
                  .then(() => toast.show('계좌번호를 복사했어요'))
              }
              className="p-1 text-muted hover:text-foreground"
            >
              <Copy className="size-4" aria-hidden />
            </button>
          </dd>
          <dt className="text-muted">예금주</dt>
          <dd>{va.holder}</dd>
          <dt className="text-muted">입금 금액</dt>
          <dd className="tabular text-body-strong">{formatPrice(o.totalAmount)}</dd>
          <dt className="text-muted">입금 기한</dt>
          <dd>{dateTime(va.dueDate)}</dd>
        </dl>
        {o.payment?.provider === 'mock' && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            loading={deposit.isPending}
            onClick={() => deposit.mutate()}
          >
            모의 입금하기 (개발용)
          </Button>
        )}
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-sm border border-primary p-5">
      <div>
        <p className="text-body-strong">결제를 완료해주세요</p>
        {o.paymentDueAt && (
          <p className="text-small text-muted">
            {dateTime(o.paymentDueAt)}까지 결제하지 않으면 주문이 자동 취소돼요.
            {o.source === 'AUCTION' && ' 낙찰 후 미결제는 경매 참여 제한 사유가 됩니다.'}
          </p>
        )}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-label">배송지</p>
          {o.shippingAddress && (
            <Button variant="link" size="sm" onClick={() => setChangeAddress((v) => !v)}>
              {changeAddress ? '기존 배송지 사용' : '변경'}
            </Button>
          )}
        </div>
        {changeAddress ? (
          <AddressList selected={addressId} onSelect={setAddressId} />
        ) : (
          o.shippingAddress && <AddressText a={o.shippingAddress} />
        )}
      </div>
      <div>
        <p className="mb-2 text-label">결제 수단</p>
        <PayMethodPicker value={method} onChange={setMethod} />
      </div>
      <Button
        size="lg"
        block
        loading={paying}
        disabled={changeAddress && !addressId}
        onClick={() => void pay(o.id, method, changeAddress ? (addressId ?? undefined) : undefined)}
      >
        {formatPrice(o.totalAmount)} 결제하기
      </Button>
    </div>
  );
}

type Modal = 'cancel' | 'refund' | 'reject' | 'ship' | 'reship' | null;

function Actions({ o, refresh }: { o: OrderDetailDto; refresh: (next?: OrderDetailDto) => void }) {
  const [modal, setModal] = useState<Modal>(null);
  const run = useMutation({
    mutationFn: (fn: () => Promise<OrderDetailDto>) => fn(),
    onSuccess: (next) => {
      setModal(null);
      toast.success(`${ORDER_STATUS_LABEL[next.status]} 상태가 되었어요`);
      refresh(next);
    },
    onError: (e) => toast.error(errMsg(e)),
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
        onClick={() =>
          confirm(
            '작품을 잘 받으셨나요? 구매를 확정하면 판매자에게 대금이 정산되고 환불을 요청할 수 없어요.',
          ) && run.mutate(() => api.orders.confirm(o.id))
        }
        loading={run.isPending}
      >
        구매 확정
      </Button>,
    );
  if (buyer && s === 'DELIVERED')
    buttons.push(
      <Button key="refund" variant="outline" onClick={() => setModal('refund')}>
        환불 요청
      </Button>,
    );
  if (seller && s === 'PAID')
    buttons.push(
      <Button
        key="prepare"
        variant="outline"
        loading={run.isPending}
        onClick={() => run.mutate(() => api.orders.prepare(o.id))}
      >
        발송 준비 중으로 변경
      </Button>,
    );
  if (seller && (s === 'PAID' || s === 'PREPARING'))
    buttons.push(
      <Button key="ship" onClick={() => setModal('ship')}>
        발송 처리
      </Button>,
    );
  if (seller && s === 'SHIPPED') {
    buttons.push(
      <Button
        key="deliver"
        loading={run.isPending}
        onClick={() => run.mutate(() => api.orders.deliver(o.id))}
      >
        배송 완료 처리
      </Button>,
      <Button key="reship" variant="outline" onClick={() => setModal('reship')}>
        송장 수정
      </Button>,
    );
  }
  if (seller && s === 'REFUND_REQUESTED')
    buttons.push(
      <Button
        key="approve"
        loading={run.isPending}
        onClick={() =>
          confirm('환불을 승인할까요? 결제 금액 전액이 구매자에게 환불되고 작품은 판매 중지 상태가 돼요.') &&
          run.mutate(() => api.orders.refundApprove(o.id))
        }
      >
        환불 승인
      </Button>,
      <Button key="reject" variant="outline" onClick={() => setModal('reject')}>
        환불 거절
      </Button>,
    );
  if (canCancel)
    buttons.push(
      <Button key="cancel" variant="ghost" onClick={() => setModal('cancel')}>
        주문 취소
      </Button>,
    );
  if (!buttons.length) return null;

  const paid = s !== 'PAYMENT_PENDING';
  return (
    <div className="flex flex-wrap gap-2">
      {buttons}
      <ReasonDialog
        open={modal === 'cancel'}
        onOpenChange={(v) => !v && setModal(null)}
        title="주문을 취소할까요?"
        description={paid ? '결제 금액 전액이 원래 결제 수단으로 환불돼요.' : undefined}
        confirmLabel="주문 취소"
        destructive
        pending={run.isPending}
        onSubmit={(r) => run.mutate(() => api.orders.cancel(o.id, r))}
      />
      <ReasonDialog
        open={modal === 'refund'}
        onOpenChange={(v) => !v && setModal(null)}
        title="환불 요청"
        description="판매자가 확인 후 승인하면 전액 환불돼요. 파손·상품 정보와 다른 점을 구체적으로 적어주세요."
        confirmLabel="환불 요청"
        minLength={5}
        pending={run.isPending}
        onSubmit={(r) => run.mutate(() => api.orders.refundRequest(o.id, r))}
      />
      <ReasonDialog
        open={modal === 'reject'}
        onOpenChange={(v) => !v && setModal(null)}
        title="환불 거절"
        description="거절 사유가 구매자에게 안내되며, 구매자는 고객센터에 조정을 요청할 수 있어요."
        confirmLabel="거절"
        destructive
        pending={run.isPending}
        onSubmit={(r) => run.mutate(() => api.orders.refundReject(o.id, r))}
      />
      {(modal === 'ship' || modal === 'reship') && (
        <ShipDialog
          open
          onOpenChange={(v) => !v && setModal(null)}
          initial={modal === 'reship' && o.shipment ? o.shipment : undefined}
          pending={run.isPending}
          onSubmit={(v) =>
            run.mutate(() =>
              modal === 'ship' ? api.orders.ship(o.id, v) : api.orders.updateShipment(o.id, v),
            )
          }
        />
      )}
    </div>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const key = ['order', id];
  const { data: o, isPending, error } = useQuery({ queryKey: key, queryFn: () => api.orders.detail(id) });
  const refresh = (next?: OrderDetailDto) => {
    if (next) qc.setQueryData(key, next);
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };

  useEffect(() => {
    if (sp.get('paid')) toast.success('결제가 완료되었어요');
  }, [sp]);

  // 상대방·워커가 상태를 바꾸면 바로 반영
  useEffect(() => {
    const socket = getRealtime();
    const on = (p: { orderId: string }) =>
      p.orderId === id && void qc.invalidateQueries({ queryKey: ['order', id] });
    socket.on('ORDER_STATUS_UPDATED', on);
    return () => void socket.off('ORDER_STATUS_UPDATED', on);
  }, [id, qc]);

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !o)
    return (
      <Alert tone="destructive" title="주문을 찾을 수 없어요">
        {errMsg(error)}
      </Alert>
    );

  const counterpart = o.role === 'buyer' ? o.seller : o.buyer;
  const pay = o.payment;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={o.status} />
          {o.source === 'AUCTION' && <span className="text-small text-muted">경매 낙찰</span>}
        </div>
        <p className="tabular text-small text-muted">
          주문번호 {o.orderNumber} · {dateTime(o.createdAt)}
        </p>
        <OrderSteps status={o.status} />
      </div>

      {o.status === 'PAYMENT_PENDING' && o.role === 'buyer' && <PendingPayment o={o} refresh={refresh} />}
      {o.status === 'CANCELLED' && (
        <Alert title="취소된 주문이에요">
          {o.cancelReason}
          {o.cancelledAt && ` · ${dateTime(o.cancelledAt)}`}
        </Alert>
      )}
      {o.status === 'REFUND_REQUESTED' && (
        <Alert tone="warning" title="환불 요청 중">
          {o.refundReason}
        </Alert>
      )}
      {o.autoConfirmAt && o.role === 'buyer' && (
        <p className="text-small text-muted">{dateTime(o.autoConfirmAt)}에 자동으로 구매 확정돼요.</p>
      )}

      <Actions o={o} refresh={refresh} />
      {o.role === 'buyer' && o.items[0] && (
        <StartChatButton
          productId={o.items[0].productId}
          label="판매자와 채팅"
          size="sm"
          className="self-start"
        />
      )}

      <Block
        title="주문 작품"
        action={
          <Link
            href={`/users/${counterpart.id}`}
            className="flex items-center gap-2 text-small hover:underline"
          >
            <Avatar avatarKey={counterpart.avatarKey} name={counterpart.nickname} size="sm" />
            {o.role === 'buyer' ? '판매자' : '구매자'} {counterpart.nickname}
          </Link>
        }
      >
        <ul className="flex flex-col gap-3">
          {o.items.map((i) => (
            <li key={i.productId}>
              <OrderItemRow item={i} />
            </li>
          ))}
        </ul>
      </Block>

      {o.shipment && (
        <Block title="배송">
          <p className="text-body">
            {o.shipment.carrier} <span className="tabular">{o.shipment.trackingNumber}</span>
          </p>
          {o.shipment.shippedAt && (
            <p className="text-small text-muted">발송 {dateTime(o.shipment.shippedAt)}</p>
          )}
          {o.shipment.trackingUrl && (
            <Button asChild variant="outline" size="sm" className="mt-2">
              <a href={o.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                배송 조회 <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
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
          <dl className="mt-3 grid grid-cols-[88px_1fr] gap-y-1 text-small">
            <dt className="text-muted">결제 수단</dt>
            <dd>{PAYMENT_METHOD_LABEL[pay.method]}</dd>
            {pay.approvedAt && (
              <>
                <dt className="text-muted">결제 일시</dt>
                <dd>{dateTime(pay.approvedAt)}</dd>
              </>
            )}
            {pay.cancelledAmount > 0 && (
              <>
                <dt className="text-muted">환불</dt>
                <dd className="tabular">{formatPrice(pay.cancelledAmount)}</dd>
              </>
            )}
          </dl>
        )}
        {pay?.receiptUrl && (
          <a
            href={pay.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-small underline"
          >
            영수증 보기
          </a>
        )}
      </Block>

      <Block title="진행 기록">
        <ol className="flex flex-col gap-2">
          {[...o.logs].reverse().map((l, i) => (
            <li key={i} className="flex gap-3 text-small">
              <span className="tabular w-36 shrink-0 text-muted">{dateTime(l.createdAt)}</span>
              <span>
                <span className="text-body-strong">{ORDER_STATUS_LABEL[l.to]}</span>
                {l.reason && <span className="text-muted"> · {l.reason}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Block>
    </div>
  );
}
