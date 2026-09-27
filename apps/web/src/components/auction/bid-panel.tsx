'use client';

import { ApiError, newIdempotencyKey } from '@shop/api-client';
import { checkBidAmount, formatPrice, type AuctionDto } from '@shop/shared';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/display';
import { PriceInput } from '@/components/ui/field';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

interface BidPanelProps {
  auction: AuctionDto;
  /** 서버 시간 기준 종료 여부 (0초가 되면 버튼만 막고 종료 확정은 서버 이벤트로) */
  closed: boolean;
  onPlaced: () => void;
  className?: string;
}

const STEPS = [0, 1, 5] as const;

/**
 * 입찰 패널. 최소 입찰가·호가 단위는 안내용으로만 계산하고 서버가 다시 검증한다.
 * 한 번 확인 후 입찰 (되돌릴 수 없음). 네트워크 재시도에도 같은 멱등 키를 써서 중복 입찰을 막는다.
 */
export function BidPanel({ auction: a, closed, onPlaced, className }: BidPanelProps) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const [amount, setAmount] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'bid' | 'buyNow'; amount: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const isSeller = user?.id === a.sellerId;
  const isHighest = !!user && a.highestBidderId === user.id;
  const quick = STEPS.map((s) => a.minNextBid + a.bidIncrement * s);

  const requireLogin = () => {
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
  };

  const open = (kind: 'bid' | 'buyNow', value: number | null) => {
    if (!user) return requireLogin();
    setError(null);
    if (kind === 'bid') {
      if (value == null) return setError('입찰 금액을 입력해주세요.');
      const check = checkBidAmount(
        {
          startPrice: a.startPrice,
          bidIncrement: a.bidIncrement,
          currentPrice: a.currentPrice,
          bidCount: a.bidCount,
          buyNowPrice: a.buyNowPrice,
        },
        value,
      );
      if (!check.ok) {
        setError(
          check.code === 'BID_TOO_LOW'
            ? `최소 입찰가는 ${formatPrice(a.minNextBid)}입니다.`
            : check.code === 'BID_NOT_ALIGNED'
              ? `${formatPrice(a.bidIncrement)} 단위로 입찰해주세요.`
              : check.code === 'BID_EXCEEDS_BUY_NOW'
                ? '즉시 구매가 이상입니다. 즉시 구매를 이용해주세요.'
                : '입찰 금액을 다시 확인해주세요.',
        );
        return;
      }
    }
    keyRef.current = newIdempotencyKey();
    setConfirm({ kind, amount: value ?? a.buyNowPrice ?? 0 });
  };

  const submit = async () => {
    if (!confirm || !keyRef.current) return;
    setPending(true);
    try {
      const r =
        confirm.kind === 'bid'
          ? await api.auctions.bid(a.id, confirm.amount, keyRef.current)
          : await api.auctions.buyNow(a.id, keyRef.current);
      setConfirm(null);
      setAmount(null);
      toast.success(
        confirm.kind === 'buyNow' ? '즉시 구매로 낙찰되었어요' : `${formatPrice(r.amount)}에 입찰했어요`,
      );
      onPlaced();
    } catch (e) {
      setConfirm(null);
      setError(e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
      onPlaced();
    } finally {
      setPending(false);
    }
  };

  if (isSeller) {
    return <Alert className={className}>내가 등록한 경매에는 입찰할 수 없어요.</Alert>;
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {isHighest && (
        <Alert tone="success" title="현재 최고 입찰자입니다">
          더 높은 입찰이 들어오면 바로 알려드릴게요.
        </Alert>
      )}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="빠른 입찰 금액">
        {quick.map((v, i) => (
          <button
            key={v}
            type="button"
            disabled={closed || isHighest}
            onClick={() => setAmount(v)}
            aria-pressed={amount === v}
            className={cn(
              'flex h-12 flex-col items-center justify-center rounded-sm border text-small disabled:opacity-40',
              amount === v ? 'border-foreground bg-surface-2' : 'border-border hover:border-foreground',
            )}
          >
            <span className="text-caption text-muted">{i === 0 ? '최소' : `+${STEPS[i]}호가`}</span>
            <span className="tabular font-semibold">{v.toLocaleString('ko-KR')}</span>
          </button>
        ))}
      </div>
      <PriceInput
        aria-label="입찰 금액"
        placeholder={`${a.minNextBid.toLocaleString('ko-KR')} 이상`}
        value={amount}
        onValueChange={setAmount}
        disabled={closed || isHighest}
      />
      <p className="text-caption text-muted">
        호가 단위 {formatPrice(a.bidIncrement)} · 입찰은 취소할 수 없어요.
      </p>
      {error && <Alert tone="destructive">{error}</Alert>}
      <Button
        size="lg"
        block
        disabled={closed || isHighest}
        onClick={() => open('bid', amount ?? a.minNextBid)}
      >
        {closed ? '경매 종료' : `${formatPrice(amount ?? a.minNextBid)} 입찰하기`}
      </Button>
      {a.buyNowPrice != null && a.currentPrice < a.buyNowPrice && !closed && (
        <Button variant="outline" size="lg" block onClick={() => open('buyNow', null)}>
          {formatPrice(a.buyNowPrice)}에 즉시 구매
        </Button>
      )}

      <Dialog
        open={!!confirm}
        onOpenChange={(v) => !v && !pending && setConfirm(null)}
        title={confirm?.kind === 'buyNow' ? '즉시 구매할까요?' : '입찰할까요?'}
        description="입찰·즉시 구매는 취소할 수 없어요. 낙찰되면 72시간 안에 결제해야 합니다."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>
              취소
            </Button>
            <Button loading={pending} onClick={() => void submit()}>
              {confirm ? `${formatPrice(confirm.amount)} ${confirm.kind === 'buyNow' ? '구매' : '입찰'}` : ''}
            </Button>
          </>
        }
      />
    </div>
  );
}
