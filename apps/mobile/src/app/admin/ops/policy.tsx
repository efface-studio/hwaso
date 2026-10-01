import { auctionPolicySchema, type AuctionPolicyInput } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAdminAction } from '@/components/admin/admin-list';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Key = keyof AuctionPolicyInput;
type Form = Record<Key, string>;

/** 항목·묶음·라벨·설명·허용 범위 (서버 auctionPolicySchema 와 같은 범위) */
const FIELDS: {
  key: Key;
  section: string;
  label: string;
  description: string;
  min: number;
  max: number;
  unit: string;
}[] = [
  {
    key: 'extensionWindowSec',
    section: '마감 연장',
    label: '마감 직전 연장 기준 (초)',
    description: '종료 몇 초 안의 입찰이면 연장할지',
    min: 0,
    max: 600,
    unit: '초',
  },
  {
    key: 'extensionSec',
    section: '마감 연장',
    label: '연장 시간 (초)',
    description: '한 번에 늘릴 시간',
    min: 0,
    max: 600,
    unit: '초',
  },
  {
    key: 'maxExtensionSec',
    section: '마감 연장',
    label: '최대 연장 (초)',
    description: '처음 종료 시각보다 최대로 늘릴 수 있는 시간',
    min: 0,
    max: 86_400,
    unit: '초',
  },
  {
    key: 'paymentDueHours',
    section: '결제',
    label: '낙찰 후 결제 기한 (시간)',
    description: '지나면 주문 취소·미결제 기록',
    min: 1,
    max: 336,
    unit: '시간',
  },
  {
    key: 'minDurationMin',
    section: '경매 기간',
    label: '최소 경매 기간 (분)',
    description: '',
    min: 1,
    max: 10_080,
    unit: '분',
  },
  {
    key: 'maxDurationDays',
    section: '경매 기간',
    label: '최대 경매 기간 (일)',
    description: '',
    min: 1,
    max: 60,
    unit: '일',
  },
  {
    key: 'endingSoonMin',
    section: '알림',
    label: '마감 임박 표시 (분)',
    description: '입찰자·관심 사용자에게 알림',
    min: 1,
    max: 1440,
    unit: '분',
  },
];

/** 화면에 보일 묶음 순서 */
const SECTIONS = [...new Set(FIELDS.map((f) => f.section))];

const range = (f: (typeof FIELDS)[number]) =>
  `${f.min.toLocaleString('ko-KR')}~${f.max.toLocaleString('ko-KR')}${f.unit}`;

const toForm = (p: AuctionPolicyInput): Form => ({
  extensionWindowSec: String(p.extensionWindowSec),
  extensionSec: String(p.extensionSec),
  maxExtensionSec: String(p.maxExtensionSec),
  paymentDueHours: String(p.paymentDueHours),
  minDurationMin: String(p.minDurationMin),
  maxDurationDays: String(p.maxDurationDays),
  endingSoonMin: String(p.endingSoonMin),
});

// 비운 칸은 NaN 이 되어 스키마 검사에서 걸린다
const num = (v: string) => (v === '' ? Number.NaN : Number(v));

/** 경매 정책: 연장·결제·기간·알림 묶음별 입력. 새로 등록·예약되는 경매부터 적용, 저장은 헤더 오른쪽 버튼 */
export default function PolicyScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['admin', 'policy'], queryFn: api.admin.policy });
  /** 고치기 전에는 서버 값을 그대로 보여준다 */
  const [edited, setEdited] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const save = useAdminAction((p: AuctionPolicyInput) => api.admin.setPolicy(p), '저장했어요', ['policy']);
  const saved = q.data ? toForm(q.data) : null;
  const form = edited ?? saved;
  const dirty = !!form && !!saved && FIELDS.some((f) => form[f.key] !== saved[f.key]);

  const submit = () => {
    if (!form) return;
    const r = auctionPolicySchema.safeParse({
      extensionWindowSec: num(form.extensionWindowSec),
      extensionSec: num(form.extensionSec),
      maxExtensionSec: num(form.maxExtensionSec),
      paymentDueHours: num(form.paymentDueHours),
      minDurationMin: num(form.minDurationMin),
      maxDurationDays: num(form.maxDurationDays),
      endingSoonMin: num(form.endingSoonMin),
    });
    if (!r.success) {
      const next: Partial<Record<Key, string>> = {};
      for (const issue of r.error.issues) {
        const f = FIELDS.find((x) => x.key === issue.path[0]);
        if (f) next[f.key] = `${range(f)} 사이 정수로 입력해주세요.`;
      }
      return setErrors(next);
    }
    setErrors({});
    // 저장 후에도 입력값을 두고, 다시 불러온 서버 값과 같아지면 저장 버튼이 꺼진다
    save.mutate([r.data]);
  };

  return (
    <FormScroll
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardDismissMode="interactive"
    >
      <Stack.Screen
        options={{
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: save.isPending ? '저장 중' : '저장',
              variant: 'prominent',
              tintColor: t.colors.primary,
              disabled: !dirty || save.isPending,
              onPress: submit,
            },
          ],
        }}
      />
      {q.isPending ? (
        <Loading variant="text" />
      ) : !form ? (
        <Empty
          kind="error"
          title="불러오지 못했어요"
          action={{ title: '다시 시도', onPress: () => void q.refetch() }}
        />
      ) : (
        <>
          <Text variant="small" color="muted">
            새로 등록·예약되는 경매부터 적용돼요.
          </Text>
          {SECTIONS.map((section) => (
            <View key={section} style={styles.section}>
              <Text variant="label" color="muted" accessibilityRole="header">
                {section}
              </Text>
              {FIELDS.filter((f) => f.section === section).map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={String(f.max).length}
                  value={form[f.key]}
                  onChangeText={(v) => setEdited({ ...form, [f.key]: v.replace(/[^\d]/g, '') })}
                  error={errors[f.key]}
                  hint={f.description ? `${f.description} · ${range(f)}` : range(f)}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48, gap: 28 },
  section: { gap: 16 },
});
