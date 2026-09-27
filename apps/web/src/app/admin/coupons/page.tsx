'use client';

import { couponSchema, formatPrice, type AdminCouponRow, type CouponInput } from '@shop/shared';
import { Plus } from 'lucide-react';
import { Suspense, useState } from 'react';
import { AdminList, dt, useAdminAction, useAdminList } from '@/components/admin/admin-list';
import { AdminPage } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Badge } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';

const local = (iso: string) =>
  new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const blank = (): CouponInput => ({
  code: '',
  name: '',
  type: 'FIXED',
  value: 5000,
  minOrderAmount: 0,
  maxDiscount: null,
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  usageLimit: null,
  isActive: true,
});

function CouponForm({ initial, onClose }: { initial: AdminCouponRow | null; onClose: () => void }) {
  const [c, setC] = useState<CouponInput>(initial ?? blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<CouponInput>) => setC((v) => ({ ...v, ...p }));
  const save = useAdminAction(
    (v: CouponInput) => (initial ? api.admin.updateCoupon(initial.id, v) : api.admin.createCoupon(v)),
    initial ? '쿠폰을 수정했어요' : '쿠폰을 만들었어요',
    ['coupons'],
  );
  const submit = () => {
    const r = couponSchema.safeParse(c);
    if (!r.success)
      return setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    save.mutate(r.data, { onSuccess: onClose });
  };
  const num = (v: string) => (v === '' ? null : Number(v));
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={initial ? '쿠폰 수정' : '새 쿠폰'}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="코드" required error={errors.code} hint="고객이 입력하는 코드 (대문자)">
          {(p) => (
            <Input {...p} value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
          )}
        </Field>
        <Field label="이름" required error={errors.name}>
          {(p) => <Input {...p} value={c.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field label="할인 방식">
          {(p) => (
            <Select
              {...p}
              value={c.type}
              onValueChange={(v) => set({ type: v })}
              options={[
                { value: 'FIXED', label: '정액 (원)' },
                { value: 'PERCENT', label: '정률 (%)' },
              ]}
            />
          )}
        </Field>
        <Field label={c.type === 'FIXED' ? '할인 금액 (원)' : '할인율 (%)'} required error={errors.value}>
          {(p) => (
            <Input
              {...p}
              type="number"
              value={c.value}
              onChange={(e) => set({ value: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="최소 주문 금액 (원)" error={errors.minOrderAmount}>
          {(p) => (
            <Input
              {...p}
              type="number"
              value={c.minOrderAmount}
              onChange={(e) => set({ minOrderAmount: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field label="최대 할인 (원, 선택)" error={errors.maxDiscount}>
          {(p) => (
            <Input
              {...p}
              type="number"
              value={c.maxDiscount ?? ''}
              onChange={(e) => set({ maxDiscount: num(e.target.value) })}
            />
          )}
        </Field>
        <Field label="시작" error={errors.startsAt}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={local(c.startsAt)}
              onChange={(e) => set({ startsAt: new Date(e.target.value).toISOString() })}
            />
          )}
        </Field>
        <Field label="종료" error={errors.endsAt}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={local(c.endsAt)}
              onChange={(e) => set({ endsAt: new Date(e.target.value).toISOString() })}
            />
          )}
        </Field>
        <Field label="전체 사용 한도 (선택)" hint="1인 1회는 항상 적용돼요">
          {(p) => (
            <Input
              {...p}
              type="number"
              value={c.usageLimit ?? ''}
              onChange={(e) => set({ usageLimit: num(e.target.value) })}
            />
          )}
        </Field>
        <div className="flex items-end">
          <Switch checked={c.isActive} onCheckedChange={(v) => set({ isActive: v })} label="사용 가능" />
        </div>
      </div>
    </Dialog>
  );
}

function Coupons() {
  const list = useAdminList<AdminCouponRow>('coupons', api.admin.coupons);
  const [edit, setEdit] = useState<AdminCouponRow | null | undefined>(undefined);
  const del = useAdminAction((id: string) => api.admin.deleteCoupon(id), '처리했어요', ['coupons']);
  const now = Date.now();
  return (
    <>
      <AdminList
        list={list}
        rowKey={(c) => c.id}
        searchPlaceholder="코드 · 이름"
        toolbar={
          <Button onClick={() => setEdit(null)}>
            <Plus className="size-4" aria-hidden />새 쿠폰
          </Button>
        }
        columns={[
          {
            key: 'code',
            header: '코드',
            cell: (c) => (
              <button type="button" onClick={() => setEdit(c)} className="font-semibold hover:underline">
                {c.code}
              </button>
            ),
          },
          { key: 'name', header: '이름', cell: (c) => c.name },
          {
            key: 'value',
            header: '할인',
            cell: (c) =>
              c.type === 'FIXED'
                ? formatPrice(c.value)
                : `${c.value}%${c.maxDiscount ? ` (최대 ${formatPrice(c.maxDiscount)})` : ''}`,
          },
          {
            key: 'min',
            header: '최소 주문',
            cell: (c) => (c.minOrderAmount ? formatPrice(c.minOrderAmount) : '-'),
          },
          {
            key: 'used',
            header: '사용',
            cell: (c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}`,
          },
          { key: 'period', header: '기간', cell: (c) => `${dt(c.startsAt)} ~ ${dt(c.endsAt)}` },
          {
            key: 'state',
            header: '상태',
            cell: (c) => (
              <Badge tone={c.isActive && Date.parse(c.endsAt) > now ? 'primary' : 'outline'}>
                {!c.isActive
                  ? '중지'
                  : Date.parse(c.endsAt) <= now
                    ? '만료'
                    : Date.parse(c.startsAt) > now
                      ? '예정'
                      : '사용 중'}
              </Badge>
            ),
          },
          {
            key: 'del',
            header: '',
            cell: (c) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  confirm(c.usedCount ? '사용된 쿠폰은 중지 처리돼요. 계속할까요?' : '쿠폰을 삭제할까요?') &&
                  del.mutate(c.id)
                }
              >
                {c.usedCount ? '중지' : '삭제'}
              </Button>
            ),
          },
        ]}
      />
      {edit !== undefined && (
        <CouponForm key={edit?.id ?? 'new'} initial={edit} onClose={() => setEdit(undefined)} />
      )}
    </>
  );
}

export default function AdminCouponsPage() {
  return (
    <AdminPage title="쿠폰" description="쿠폰 할인은 플랫폼이 부담하며 판매자 정산에는 영향이 없어요.">
      <Suspense>
        <Coupons />
      </Suspense>
    </AdminPage>
  );
}
