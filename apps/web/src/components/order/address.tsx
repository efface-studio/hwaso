'use client';

import { ApiError } from '@shop/api-client';
import { addressSchema, type AddressDto } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/choice';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/stores/toast';
import { PostcodeSearch } from './postcode';

export const ADDRESSES_KEY = ['addresses'] as const;
export const useAddresses = () => useQuery({ queryKey: ADDRESSES_KEY, queryFn: api.orders.addresses });

const MEMO_PRESETS = [
  '문 앞에 놓아주세요',
  '경비실에 맡겨주세요',
  '배송 전 연락 부탁드려요',
  '파손 주의 — 직접 전달해주세요',
];
const phoneText = (p: string) => p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');

export function AddressText({
  a,
  className,
}: {
  a: Omit<AddressDto, 'id' | 'isDefault'>;
  className?: string;
}) {
  return (
    <div className={cn('text-small', className)}>
      <p className="text-body-strong">
        {a.recipient} <span className="ml-1 font-normal text-muted">{phoneText(a.phone)}</span>
      </p>
      <p className="mt-0.5">
        [{a.zipCode}] {a.address1} {a.address2}
      </p>
      {a.memo && <p className="mt-0.5 text-muted">{a.memo}</p>}
    </div>
  );
}

type Draft = {
  recipient: string;
  phone: string;
  zipCode: string;
  address1: string;
  address2: string;
  memo: string;
  isDefault: boolean;
};
const empty: Draft = {
  recipient: '',
  phone: '',
  zipCode: '',
  address1: '',
  address2: '',
  memo: '',
  isDefault: false,
};

/** 배송지 추가 · 수정. 주소는 우편번호 검색으로만 채워 오타를 막는다 */
export function AddressDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: AddressDto | null;
  onSaved?: (a: AddressDto) => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial ? { ...initial } : empty);
  const [searching, setSearching] = useState(!initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const onSelect = useCallback((zipCode: string, address1: string) => {
    setD((prev) => ({ ...prev, zipCode, address1 }));
    setSearching(false);
  }, []);

  const save = useMutation({
    mutationFn: () => (initial ? api.orders.updateAddress(initial.id, d) : api.orders.createAddress(d)),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
      toast.success(initial ? '배송지를 수정했어요' : '배송지를 추가했어요');
      onSaved?.(a);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '저장하지 못했습니다.'),
  });

  const submit = () => {
    const r = addressSchema.safeParse(d);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? '배송지 수정' : '새 배송지'}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={searching}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="받는 분" required error={errors.recipient}>
            {(p) => (
              <Input
                {...p}
                autoComplete="name"
                value={d.recipient}
                onChange={(e) => set({ recipient: e.target.value })}
              />
            )}
          </Field>
          <Field label="연락처" required error={errors.phone}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-0000-0000"
                value={d.phone}
                onChange={(e) => set({ phone: e.target.value })}
              />
            )}
          </Field>
        </div>
        {searching ? (
          <div className="flex flex-col gap-2">
            <p className="text-label">주소 검색</p>
            <PostcodeSearch onSelect={onSelect} />
            {d.address1 && (
              <Button variant="ghost" size="sm" onClick={() => setSearching(false)}>
                검색 닫기
              </Button>
            )}
          </div>
        ) : (
          <Field label="주소" required error={errors.address1 ?? errors.zipCode}>
            {(p) => (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    {...p}
                    readOnly
                    value={d.address1 ? `[${d.zipCode}] ${d.address1}` : ''}
                    placeholder="주소를 검색해주세요"
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={() => setSearching(true)}>
                    주소 검색
                  </Button>
                </div>
                <Input
                  aria-label="상세 주소"
                  autoComplete="address-line2"
                  placeholder="상세 주소 (동·호수)"
                  value={d.address2}
                  onChange={(e) => set({ address2: e.target.value })}
                />
              </div>
            )}
          </Field>
        )}
        <Field label="배송 메모" error={errors.memo}>
          {(p) => (
            <>
              <Input
                {...p}
                list="memo-presets"
                maxLength={200}
                placeholder="예) 문 앞에 놓아주세요"
                value={d.memo}
                onChange={(e) => set({ memo: e.target.value })}
              />
              <datalist id="memo-presets">
                {MEMO_PRESETS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        {!initial?.isDefault && (
          <Checkbox
            checked={d.isDefault}
            onCheckedChange={(v) => set({ isDefault: v })}
            label="기본 배송지로 설정"
          />
        )}
      </div>
    </Dialog>
  );
}

/** 결제·설정 공용 배송지 목록. onSelect 가 있으면 선택형(라디오), 없으면 관리형(수정·삭제) */
export function AddressList({
  selected,
  onSelect,
}: {
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isPending } = useAddresses();
  const [editing, setEditing] = useState<AddressDto | null | undefined>(undefined);
  const remove = useMutation({
    mutationFn: (id: string) => api.orders.deleteAddress(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
      toast.success('배송지를 삭제했어요');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '삭제하지 못했습니다.'),
  });

  if (isPending) return <div className="h-24 animate-pulse bg-surface-2" />;
  return (
    <div className="flex flex-col gap-2">
      {!data?.length && (
        <div className="flex flex-col items-center gap-2 border border-dashed border-border-strong p-6 text-center">
          <MapPin className="size-6 text-faint" aria-hidden />
          <p className="text-small text-muted">등록된 배송지가 없어요.</p>
        </div>
      )}
      <ul role={onSelect ? 'radiogroup' : undefined} aria-label="배송지" className="flex flex-col gap-2">
        {data?.map((a) => {
          const active = selected === a.id;
          return (
            <li
              key={a.id}
              role={onSelect ? 'radio' : undefined}
              aria-checked={onSelect ? active : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={() => onSelect?.(a.id)}
              onKeyDown={(e) => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(a.id);
                }
              }}
              className={cn(
                'flex items-start gap-3 rounded-sm border p-4',
                onSelect && 'cursor-pointer',
                active ? 'border-primary' : 'border-border',
              )}
            >
              {onSelect && (
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-primary' : 'border-border-strong',
                  )}
                >
                  {active && <span className="size-2.5 rounded-full bg-primary" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {a.isDefault && (
                  <span className="mb-1 inline-block text-caption text-primary">기본 배송지</span>
                )}
                <AddressText a={a} />
              </div>
              <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                  수정
                </Button>
                {!onSelect && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => confirm('이 배송지를 삭제할까요?') && remove.mutate(a.id)}
                  >
                    삭제
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Button variant="outline" onClick={() => setEditing(null)}>
        <Plus className="size-4" aria-hidden />새 배송지 추가
      </Button>
      {editing !== undefined && (
        <AddressDialog
          key={editing?.id ?? 'new'}
          open
          onOpenChange={(v) => !v && setEditing(undefined)}
          initial={editing}
          onSaved={(a) => onSelect?.(a.id)}
        />
      )}
    </div>
  );
}
