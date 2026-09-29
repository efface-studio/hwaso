import { couponSchema, formatPrice, type AdminCouponRow, type CouponInput } from '@shop/shared';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { AdminList, useAdminAction } from '@/components/admin/admin-list';
import { AdminRow } from '@/components/admin/row';
import { StatusText, type StatusTone } from '@/components/admin/status';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { DateTimeField, PriceField } from '@/components/ui/inputs';
import { RadioList } from '@/components/ui/radio';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 숫자 칸은 비워 둘 수 있게 편집 중에만 null 을 허용한다 */
type Draft = Omit<CouponInput, 'value' | 'minOrderAmount'> & {
  value: number | null;
  minOrderAmount: number | null;
};

const DAY = 86_400_000;

/** zod 기본 문구(영문) 대신 보여줄 안내 — 스키마에 직접 쓴 문구(refine 등)는 그대로 쓴다 */
const FIELD_MSG: Record<string, string> = {
  code: '영문 대문자·숫자·-·_ 3~40자로 입력해주세요.',
  name: '이름을 1~60자로 입력해주세요.',
  value: '할인 값을 입력해주세요.',
  minOrderAmount: '최소 주문 금액을 확인해주세요.',
  maxDiscount: '최대 할인 금액을 확인해주세요.',
  usageLimit: '사용 한도는 1 이상으로 정해주세요.',
};

const blank = (): Draft => ({
  code: '',
  name: '',
  type: 'FIXED',
  value: 5000,
  minOrderAmount: 0,
  maxDiscount: null,
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 30 * DAY).toISOString(),
  usageLimit: null,
  isActive: true,
});

/** 목록 행(id·usedCount 포함)에서 입력값만 골라낸다 — 스키마가 strictObject 라 다른 키가 있으면 거절된다 */
const fromRow = (c: AdminCouponRow): Draft => ({
  code: c.code,
  name: c.name,
  type: c.type,
  value: c.value,
  minOrderAmount: c.minOrderAmount,
  maxDiscount: c.maxDiscount,
  startsAt: c.startsAt,
  endsAt: c.endsAt,
  usageLimit: c.usageLimit,
  isActive: c.isActive,
});

const digits = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d ? Number(d) : null;
};

const discountText = (c: AdminCouponRow) =>
  c.type === 'FIXED'
    ? formatPrice(c.value)
    : `${c.value}%${c.maxDiscount ? ` (최대 ${formatPrice(c.maxDiscount)})` : ''}`;

/** 쿠폰 상태: 사용 중이 기본이라 표시하지 않고, 중지·만료는 흐리게 */
function couponState(c: AdminCouponRow, now: number): { label: string; tone: StatusTone; off: boolean } {
  if (!c.isActive) return { label: '중지', tone: 'neutral', off: true };
  if (Date.parse(c.endsAt) <= now) return { label: '만료', tone: 'neutral', off: true };
  if (Date.parse(c.startsAt) > now) return { label: '예정', tone: 'warning', off: false };
  return { label: '사용 중', tone: 'positive', off: false };
}

/** 입력 묶음 제목 */
function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="label" color="muted" accessibilityRole="header">
      {children}
    </Text>
  );
}

/** 쿠폰 편집 시트: 기본 정보 · 할인 · 기간과 사용 묶음 */
function CouponForm({ initial, onClose }: { initial: AdminCouponRow | null; onClose: () => void }) {
  const t = useTheme();
  const [c, setC] = useState<Draft>(() => (initial ? fromRow(initial) : blank()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<Draft>) => setC((v) => ({ ...v, ...p }));
  const save = useAdminAction(
    (v: CouponInput) => (initial ? api.admin.updateCoupon(initial.id, v) : api.admin.createCoupon(v)),
    initial ? '쿠폰을 수정했어요' : '쿠폰을 만들었어요',
    ['coupons'],
  );
  const submit = () => {
    const r = couponSchema.safeParse({
      ...c,
      minOrderAmount: c.minOrderAmount ?? 0,
      // 최대 할인은 정률에서만 쓴다
      maxDiscount: c.type === 'PERCENT' ? c.maxDiscount : null,
    });
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues) {
        const k = String(i.path[0]);
        next[k] ??= i.code === 'custom' ? i.message : (FIELD_MSG[k] ?? i.message);
      }
      return setErrors(next);
    }
    setErrors({});
    save.mutate([r.data], { onSuccess: onClose });
  };

  return (
    <Sheet title={initial ? '쿠폰 수정' : '새 쿠폰'} onClose={onClose}>
      <View style={styles.section}>
        <SectionTitle>기본 정보</SectionTitle>
        <Field
          label="코드"
          maxLength={40}
          value={c.code}
          onChangeText={(v) => set({ code: v.toUpperCase() })}
          error={errors.code}
          hint="영문 대문자·숫자·-·_ 3~40자"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Field
          label="이름"
          counter
          maxLength={60}
          value={c.name}
          onChangeText={(name) => set({ name })}
          error={errors.name}
        />
      </View>
      <View style={styles.section}>
        <SectionTitle>할인</SectionTitle>
        <View style={styles.field}>
          <Text variant="label">할인 방식</Text>
          <RadioList
            label="할인 방식"
            value={c.type}
            // 원 ↔ % 단위가 바뀌므로 값은 다시 입력받는다
            onChange={(type) => type !== c.type && set({ type, value: null })}
            options={[
              { value: 'FIXED', label: '정액 (원)' },
              { value: 'PERCENT', label: '정률 (%)' },
            ]}
          />
        </View>
        {c.type === 'FIXED' ? (
          <PriceField
            label="할인 금액 (원)"
            value={c.value}
            onChange={(value) => set({ value })}
            error={errors.value}
          />
        ) : (
          <Field
            label="할인율 (%)"
            value={c.value != null ? String(c.value) : ''}
            onChangeText={(v) => set({ value: digits(v) })}
            error={errors.value}
            hint="90% 이하"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            placeholder="10"
          />
        )}
        <PriceField
          label="최소 주문 금액 (원)"
          value={c.minOrderAmount}
          onChange={(minOrderAmount) => set({ minOrderAmount })}
          error={errors.minOrderAmount}
        />
        {c.type === 'PERCENT' && (
          <PriceField
            label="최대 할인 (원, 선택)"
            value={c.maxDiscount}
            onChange={(maxDiscount) => set({ maxDiscount })}
            error={errors.maxDiscount}
            placeholder="제한 없음"
          />
        )}
      </View>
      <View style={styles.section}>
        <SectionTitle>기간 · 사용</SectionTitle>
        <DateTimeField
          label="시작"
          value={new Date(c.startsAt)}
          onChange={(d) => set({ startsAt: d.toISOString() })}
          error={errors.startsAt}
        />
        <DateTimeField
          label="종료"
          value={new Date(c.endsAt)}
          onChange={(d) => set({ endsAt: d.toISOString() })}
          error={errors.endsAt}
        />
        <Field
          label="전체 사용 한도 (선택)"
          value={c.usageLimit != null ? String(c.usageLimit) : ''}
          onChangeText={(v) => set({ usageLimit: digits(v) })}
          error={errors.usageLimit}
          hint="1인 1회는 항상 적용돼요"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={9}
          placeholder="무제한"
        />
        <View style={[styles.switchRow, { minHeight: t.touch }]}>
          <Text style={{ flex: 1 }}>사용 가능</Text>
          <Switch
            value={c.isActive}
            onValueChange={(isActive) => set({ isActive })}
            trackColor={{ true: t.colors.primary }}
            accessibilityLabel="사용 가능"
          />
        </View>
      </View>
      <Button title="저장" block loading={save.isPending} onPress={submit} />
    </Sheet>
  );
}

/** 쿠폰 한 줄: 코드 · 할인 금액 · 이름과 최소 주문 · 상태 · 사용 수와 기간 */
function CouponRow({ c, now, onPress }: { c: AdminCouponRow; now: number; onPress: () => void }) {
  const state = couponState(c, now);
  const discount = discountText(c);
  const used = `사용 ${c.usedCount.toLocaleString('ko-KR')} / ${c.usageLimit?.toLocaleString('ko-KR') ?? '무제한'}`;
  return (
    <AdminRow
      title={c.code}
      value={discount}
      detail={`${c.name} · 최소 주문 ${formatPrice(c.minOrderAmount)}`}
      status={state.tone === 'positive' ? undefined : <StatusText label={state.label} tone={state.tone} />}
      meta={`${used} · ${dt(c.startsAt)} ~ ${dt(c.endsAt)}`}
      dimmed={state.off}
      accessibilityLabel={`${c.code}, ${c.name}, ${discount} 할인, ${state.label}`}
      accessibilityHint="수정하거나 삭제해요"
      onPress={onPress}
    />
  );
}

/** 쿠폰: 목록·검색, 누르면 수정·삭제(사용된 쿠폰은 중지) */
export default function AdminCouponsScreen() {
  // undefined: 닫힘, null: 새 쿠폰, 행: 수정
  const [edit, setEdit] = useState<AdminCouponRow | null | undefined>(undefined);
  // 사용 이력이 있으면 서버가 삭제 대신 중지한다 — 안내는 누른 항목에 맞춰 직접 띄운다
  const del = useAdminAction((id: string) => api.admin.deleteCoupon(id), null, ['coupons']);
  const now = Date.now();

  const remove = (c: AdminCouponRow) => {
    const used = c.usedCount > 0;
    Alert.alert(
      used ? '쿠폰을 중지할까요?' : '쿠폰을 삭제할까요?',
      used ? '사용된 쿠폰은 삭제하지 않고 중지돼요.' : undefined,
      [
        { text: '취소', style: 'cancel' },
        {
          text: used ? '중지' : '삭제',
          style: 'destructive',
          onPress: () =>
            del.mutate([c.id], { onSuccess: () => Alert.alert(used ? '중지했어요' : '삭제했어요') }),
        },
      ],
    );
  };
  const menu = (c: AdminCouponRow) =>
    actionSheet(`${c.code} · ${c.name}`, [
      { label: '수정', onPress: () => setEdit(c) },
      { label: c.usedCount > 0 ? '중지' : '삭제', destructive: true, onPress: () => remove(c) },
    ]);

  return (
    <>
      <AdminList<AdminCouponRow>
        queryKey="coupons"
        fetcher={api.admin.coupons}
        searchPlaceholder="코드 · 이름"
        emptyTitle="쿠폰이 없어요."
        headerItems={[
          {
            type: 'button',
            label: '새 쿠폰 만들기',
            icon: { type: 'sfSymbol', name: 'plus' },
            onPress: () => setEdit(null),
          },
        ]}
        renderItem={(c) => <CouponRow c={c} now={now} onPress={() => menu(c)} />}
      />
      {edit !== undefined && (
        <CouponForm key={edit?.id ?? 'new'} initial={edit} onClose={() => setEdit(undefined)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14, marginTop: 6 },
  field: { gap: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
