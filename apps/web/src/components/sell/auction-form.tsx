'use client';

import { formatPrice, suggestIncrement } from '@shop/shared';
import { Switch } from '@/components/ui/choice';
import { Field, Input, PriceInput, Textarea } from '@/components/ui/field';

export interface AuctionDraft {
  startPrice: number | null;
  bidIncrement: number | null;
  buyNowPrice: number | null;
  startsAt: string;
  endsAt: string;
  autoExtend: boolean;
  description: string;
}

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function defaultAuction(): AuctionDraft {
  const start = new Date(Date.now() + 60 * 60_000);
  start.setMinutes(0, 0, 0);
  return {
    startPrice: null,
    bidIncrement: null,
    buyNowPrice: null,
    startsAt: local(start),
    endsAt: local(new Date(start.getTime() + 3 * 86_400_000)),
    autoExtend: true,
    description: '',
  };
}

export function auctionToInput(a: AuctionDraft, productId: string) {
  return {
    productId,
    startPrice: a.startPrice ?? 0,
    bidIncrement: a.bidIncrement ?? suggestIncrement(a.startPrice ?? 0),
    buyNowPrice: a.buyNowPrice,
    startsAt: new Date(a.startsAt).toISOString(),
    endsAt: new Date(a.endsAt).toISOString(),
    autoExtend: a.autoExtend,
    description: a.description,
  };
}

/** 경매 조건. 시간·금액 규칙은 서버(관리자 정책)가 최종 검증한다 */
export function AuctionFields({
  a,
  set,
  errors,
}: {
  a: AuctionDraft;
  set: (patch: Partial<AuctionDraft>) => void;
  errors: Record<string, string>;
}) {
  const suggested = a.startPrice ? suggestIncrement(a.startPrice) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="시작가" required error={errors.startPrice}>
          {(p) => <PriceInput {...p} value={a.startPrice} onValueChange={(v) => set({ startPrice: v })} />}
        </Field>
        <Field
          label="호가 단위"
          required
          error={errors.bidIncrement}
          hint={suggested ? `추천 ${formatPrice(suggested)}` : '한 번에 올릴 최소 금액'}
        >
          {(p) => (
            <PriceInput
              {...p}
              value={a.bidIncrement}
              onValueChange={(v) => set({ bidIncrement: v })}
              placeholder={suggested?.toLocaleString('ko-KR')}
            />
          )}
        </Field>
      </div>
      <Field
        label="즉시 구매가 (선택)"
        error={errors.buyNowPrice}
        hint="이 금액이면 경매를 기다리지 않고 바로 낙찰돼요."
      >
        {(p) => <PriceInput {...p} value={a.buyNowPrice} onValueChange={(v) => set({ buyNowPrice: v })} />}
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="시작" required error={errors.startsAt}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={a.startsAt}
              onChange={(e) => set({ startsAt: e.target.value })}
            />
          )}
        </Field>
        <Field label="종료" required error={errors.endsAt}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={a.endsAt}
              onChange={(e) => set({ endsAt: e.target.value })}
            />
          )}
        </Field>
      </div>
      <Switch
        checked={a.autoExtend}
        onCheckedChange={(v) => set({ autoExtend: v })}
        label="마감 직전 자동 연장"
        description="종료 30초 안에 입찰이 있으면 30초 연장돼요 (최대 30분)"
      />
      <Field label="경매 안내 (선택)">
        {(p) => (
          <Textarea
            {...p}
            maxLength={2000}
            value={a.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="예) 낙찰 후 전문 운송으로 발송합니다."
          />
        )}
      </Field>
    </div>
  );
}
