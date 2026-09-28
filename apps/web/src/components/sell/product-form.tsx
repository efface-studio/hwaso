'use client';

import { CONDITION_LABEL, ITEM_CONDITIONS, PROVENANCE_KINDS, type CategoryNode } from '@shop/shared';
import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { DateTimeInput } from '@/components/ui/date-picker';
import { RadioGroup } from '@/components/ui/choice';
import { Field, Input, PriceInput, Textarea } from '@/components/ui/field';
import { Select } from '@/components/ui/select';

// 폼 상태·변환은 앱과 함께 쓴다 (@shop/shared/sell)
import type { ProductDraft } from '@shop/shared';
export { draftFromProduct, draftToInput, emptyDraft, type ProductDraft } from '@shop/shared';

type Set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => void;

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border py-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-h3">{title}</h2>
        {description && <p className="mt-0.5 text-small text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function BasicFields({
  d,
  set,
  categories,
  errors,
}: {
  d: ProductDraft;
  set: Set;
  categories: CategoryNode[];
  errors: Record<string, string>;
}) {
  const options = categories.flatMap((g) =>
    g.children.map((c) => ({ value: c.id, label: `${g.name} › ${c.name}` })),
  );
  return (
    <>
      <Field label="작품명" required error={errors.title}>
        {(p) => (
          <Input
            {...p}
            maxLength={100}
            value={d.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="예) 무제 (Untitled), 백자 달항아리"
          />
        )}
      </Field>
      <Field label="카테고리" required error={errors.categoryId}>
        {(p) => (
          <Select
            {...p}
            value={d.categoryId}
            onValueChange={(v) => set('categoryId', v)}
            options={options}
            placeholder="카테고리 선택"
          />
        )}
      </Field>
      <Field label="작가 · 제작자" hint="모르면 비워두세요. 작가 페이지에 자동으로 연결돼요.">
        {(p) => (
          <Input
            {...p}
            maxLength={100}
            value={d.artistName}
            onChange={(e) => set('artistName', e.target.value)}
            placeholder="예) 김환기"
          />
        )}
      </Field>
    </>
  );
}

export function PriceFields({
  d,
  set,
  errors,
  lockSaleType,
}: {
  d: ProductDraft;
  set: Set;
  errors: Record<string, string>;
  lockSaleType?: boolean;
}) {
  return (
    <>
      {!lockSaleType && (
        <RadioGroup
          aria-label="판매 방식"
          value={d.saleType}
          onValueChange={(v) => set('saleType', v)}
          options={[
            { value: 'FIXED', label: '즉시 구매', description: '정한 가격에 바로 판매해요' },
            { value: 'AUCTION', label: '경매', description: '시작가와 일정을 정하면 실시간 입찰로 판매해요' },
            { value: 'RESERVATION', label: '예약 판매', description: '정한 날짜부터 구매할 수 있어요' },
          ]}
        />
      )}
      {d.saleType !== 'AUCTION' && (
        <Field label="판매 가격" required error={errors.price}>
          {(p) => <PriceInput {...p} value={d.price} onValueChange={(v) => set('price', v)} />}
        </Field>
      )}
      {d.saleType === 'RESERVATION' && (
        <Field label="판매 시작일" required error={errors.availableAt}>
          {(p) => <DateTimeInput {...p} value={d.availableAt} onChange={(v) => set('availableAt', v)} />}
        </Field>
      )}
      {d.saleType === 'AUCTION' && (
        <p className="text-small text-muted">시작가·일정은 다음 단계에서 정해요.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="배송비" hint="0원이면 무료배송">
          {(p) => <PriceInput {...p} value={d.shippingFee} onValueChange={(v) => set('shippingFee', v)} />}
        </Field>
        <Field label="배송 방법">
          {(p) => (
            <Input
              {...p}
              maxLength={100}
              value={d.shippingMethod}
              onChange={(e) => set('shippingMethod', e.target.value)}
            />
          )}
        </Field>
      </div>
    </>
  );
}

export function DetailFields({
  d,
  set,
  errors,
}: {
  d: ProductDraft;
  set: Set;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field label="작품 설명" error={errors.description}>
        {(p) => (
          <Textarea
            {...p}
            maxLength={10_000}
            className="min-h-40"
            value={d.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="제작 배경, 소장 경위, 액자 여부, 실물 느낌 등을 적어주세요."
          />
        )}
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="시대">
          {(p) => (
            <Input
              {...p}
              maxLength={50}
              value={d.era}
              onChange={(e) => set('era', e.target.value)}
              placeholder="예) 조선 18세기"
            />
          )}
        </Field>
        <Field label="제작 연도">
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              maxLength={5}
              value={d.productionYear}
              onChange={(e) => set('productionYear', e.target.value.replace(/[^\d-]/g, ''))}
            />
          )}
        </Field>
        <Field label="소재 · 기법">
          {(p) => (
            <Input
              {...p}
              maxLength={100}
              value={d.material}
              onChange={(e) => set('material', e.target.value)}
              placeholder="예) 캔버스에 유채"
            />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['widthCm', 'heightCm', 'depthCm'] as const).map((k, i) => (
          <Field key={k} label={['가로 (cm)', '세로 (cm)', '깊이 (cm)'][i]}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={d[k]}
                onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ''))}
              />
            )}
          </Field>
        ))}
      </div>
      <Field label="상태">
        {(p) => (
          <Select
            {...p}
            value={d.condition}
            onValueChange={(v) => set('condition', v)}
            options={ITEM_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))}
          />
        )}
      </Field>
      <Field label="상태 설명" hint="손상·복원 이력이 있다면 꼭 적어주세요.">
        {(p) => (
          <Textarea
            {...p}
            maxLength={1000}
            value={d.conditionNote}
            onChange={(e) => set('conditionNote', e.target.value)}
          />
        )}
      </Field>
      <Field label="거래 지역">
        {(p) => (
          <Input
            {...p}
            maxLength={50}
            value={d.region}
            onChange={(e) => set('region', e.target.value)}
            placeholder="예) 서울 종로구"
          />
        )}
      </Field>
    </>
  );
}

export function AuthenticityFields({
  d,
  set,
  errors,
}: {
  d: ProductDraft;
  set: Set;
  errors: Record<string, string>;
}) {
  return (
    <>
      <RadioGroup
        aria-label="인증서"
        value={d.hasCertificate ? 'yes' : 'no'}
        onValueChange={(v) => set('hasCertificate', v === 'yes')}
        options={[
          { value: 'no', label: '인증서 없음' },
          {
            value: 'yes',
            label: '감정서·인증서 있음',
            description: '운영팀 검수 후 “플랫폼 검수 완료”가 표시돼요',
          },
        ]}
      />
      {d.hasCertificate && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="발급 기관" required error={errors['certificate.issuer']}>
            {(p) => <Input {...p} value={d.certIssuer} onChange={(e) => set('certIssuer', e.target.value)} />}
          </Field>
          <Field label="인증서 번호" required error={errors['certificate.number']}>
            {(p) => <Input {...p} value={d.certNumber} onChange={(e) => set('certNumber', e.target.value)} />}
          </Field>
          <Field label="발급일">
            {(p) => (
              <DateTimeInput
                {...p}
                mode="date"
                value={d.certIssuedAt}
                onChange={(v) => set('certIssuedAt', v)}
              />
            )}
          </Field>
          <Field label="비고">
            {(p) => <Input {...p} value={d.certNote} onChange={(e) => set('certNote', e.target.value)} />}
          </Field>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-label">출처 · 전시 · 출판 이력</p>
        {d.provenance.map((v, i) => (
          <div key={i} className="grid grid-cols-[110px_90px_1fr_auto] items-center gap-2">
            <Select
              aria-label="이력 종류"
              size="sm"
              value={v.kind}
              onValueChange={(k) =>
                set(
                  'provenance',
                  d.provenance.map((x, j) => (j === i ? { ...x, kind: k } : x)),
                )
              }
              options={PROVENANCE_KINDS.map((k) => ({
                value: k,
                label: { OWNERSHIP: '소장', EXHIBITION: '전시', PUBLICATION: '출판' }[k],
              }))}
            />
            <Input
              aria-label="시기"
              className="h-9"
              placeholder="시기"
              value={v.period}
              onChange={(e) =>
                set(
                  'provenance',
                  d.provenance.map((x, j) => (j === i ? { ...x, period: e.target.value } : x)),
                )
              }
            />
            <Input
              aria-label="내용"
              className="h-9"
              placeholder="예) 개인 소장 (서울)"
              value={v.title}
              onChange={(e) =>
                set(
                  'provenance',
                  d.provenance.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                )
              }
            />
            <button
              type="button"
              aria-label="이력 삭제"
              onClick={() =>
                set(
                  'provenance',
                  d.provenance.filter((_, j) => j !== i),
                )
              }
              className="p-2 text-muted hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set('provenance', [...d.provenance, { kind: 'OWNERSHIP', period: '', title: '' }])}
          className="inline-flex items-center gap-1 self-start text-small font-semibold text-primary"
        >
          <Plus className="size-4" aria-hidden />
          이력 추가
        </button>
      </div>
    </>
  );
}
