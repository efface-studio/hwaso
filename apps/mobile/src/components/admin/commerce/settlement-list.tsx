import {
  SETTLEMENT_STATUSES,
  formatPrice,
  type AdminSettlementRow,
  type SettlementStatus,
} from '@shop/shared';
import { router, type NativeStackHeaderItem } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { AdminList, useAdminAction } from '@/components/admin/admin-list';
import { AdminRow } from '@/components/admin/row';
import { StatusText, type StatusTone } from '@/components/admin/status';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

type Action = 'pay' | 'hold' | 'release';

const STATUS: Record<SettlementStatus, string> = {
  PENDING: '대기',
  SCHEDULED: '지급 예정',
  PAID: '지급 완료',
  HELD: '보류',
};
/** 지급 예정(기본)은 숨기고, 보류는 빨간 글자로 */
const TONE: Record<SettlementStatus, StatusTone | null> = {
  PENDING: 'neutral',
  SCHEDULED: null,
  PAID: 'neutral',
  HELD: 'negative',
};
const STATUS_OPTIONS = SETTLEMENT_STATUSES.map((s) => ({ value: s, label: STATUS[s] }));
const ACTION_LABEL: Record<Action, string> = { pay: '지급 완료로 처리', hold: '보류', release: '보류 해제' };
/** 서버 settlementActionSchema 의 최대 건수 */
const MAX = 100;

const initialOf = (options: { value: string }[], v: string | undefined) =>
  options.some((o) => o.value === v) ? v : undefined;

const CHECK = 22;
/** 구분선을 글자 시작점까지 들여 쓴다 (여백 16 + 선택 표시 + 간격 12) */
const CHECK_INSET = 16 + CHECK + 12;

/** 정산 한 줄: 선택 표시 · 주문번호와 지급액 · 판매자와 계좌 · 상태 · 판매액 − 수수료와 지급(예정)일 */
function SettlementRow({
  s,
  checked,
  onToggle,
}: {
  s: AdminSettlementRow;
  checked: boolean;
  onToggle: () => void;
}) {
  const t = useTheme();
  const openOrder = () => router.push({ pathname: '/orders/[id]', params: { id: s.orderId } });
  const tone = TONE[s.status];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${s.orderNumber}, ${s.seller.nickname}, 지급 ${formatPrice(s.netAmount)}, ${STATUS[s.status]}`}
      accessibilityHint="눌러서 선택, 길게 눌러 주문 보기"
      accessibilityActions={[{ name: 'longpress', label: '주문 보기' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && openOrder()}
      onPress={onToggle}
      onLongPress={openOrder}
      style={({ pressed }) => pressed && { backgroundColor: t.colors.surface2 }}
    >
      <AdminRow
        leading={
          <Icon
            ios={checked ? 'checkmark.circle.fill' : 'circle'}
            android={checked ? 'check_circle' : 'radio_button_unchecked'}
            color={checked ? 'primary' : 'faint'}
            size={CHECK}
          />
        }
        title={s.orderNumber}
        value={formatPrice(s.netAmount)}
        detail={`${s.seller.nickname} · ${s.bank ?? '계좌 없음'}`}
        status={tone && <StatusText label={STATUS[s.status]} tone={tone} />}
        meta={`${formatPrice(s.grossAmount)} − 수수료 ${formatPrice(s.feeAmount)} · ${
          s.paidAt ? `지급 ${dt(s.paidAt)}` : `예정 ${dt(s.scheduledAt)}`
        }`}
        chevron={false}
      />
    </Pressable>
  );
}

/** 건수 줄의 글자 버튼 (선택 해제) */
function TextAction({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      <Text variant="bodyStrong" color="primary">
        {title}
      </Text>
    </Pressable>
  );
}

/**
 * 정산: 구매 확정 2일 뒤 지급 예정이 된다. 실제 이체 후 '지급 완료'로 처리하고, 분쟁 중인 건은 보류한다.
 * 줄을 눌러 여러 건을 고르면 헤더에 'N건 처리' 메뉴가 나타나 한 번에 처리한다 (최대 100건).
 */
export function SettlementList({ header, status }: { header: ReactNode; status?: string }) {
  const t = useTheme();
  // 고른 정산 (합계 계산을 위해 줄 데이터를 함께 둔다)
  const [picked, setPicked] = useState<Map<string, AdminSettlementRow>>(() => new Map());
  const run = useAdminAction(api.admin.settlementAction, '정산 상태를 바꿨어요', [
    'settlements',
    'dashboard',
  ]);

  const selected = [...picked.values()];
  const total = selected.reduce((sum, r) => sum + r.netAmount, 0);

  const toggle = (s: AdminSettlementRow) => {
    if (!picked.has(s.id) && picked.size >= MAX) {
      Alert.alert(`한 번에 ${MAX}건까지 처리할 수 있어요.`);
      return;
    }
    selectionHaptic();
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.set(s.id, s);
      return next;
    });
  };

  const act = (action: Action) =>
    Alert.alert(`${selected.length}건 (${formatPrice(total)})을 ${ACTION_LABEL[action]}할까요?`, undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: ACTION_LABEL[action],
        style: action === 'hold' ? 'destructive' : 'default',
        onPress: () =>
          run.mutate([selected.map((r) => r.id), action], { onSuccess: () => setPicked(new Map()) }),
      },
    ]);

  const toolbar = selected.length > 0 && (
    <View accessibilityRole="toolbar" style={[styles.toolbar, { borderColor: t.colors.border }]}>
      <View style={styles.line}>
        <Text variant="small" color="muted" style={styles.tabular} accessibilityLiveRegion="polite">
          {selected.length}건 선택 · {formatPrice(total)}
        </Text>
        {run.isPending ? (
          <ActivityIndicator color={t.colors.primary} />
        ) : (
          <TextAction title="선택 해제" onPress={() => setPicked(new Map())} />
        )}
      </View>
    </View>
  );

  // 처리 버튼은 헤더에 둬 목록을 어디까지 내려도 바로 누를 수 있다 (iOS 편집 모드처럼)
  const bulk: NativeStackHeaderItem[] = selected.length
    ? [
        {
          type: 'menu',
          label: `${selected.length}건 처리`,
          variant: 'prominent',
          tintColor: t.colors.primary,
          disabled: run.isPending,
          menu: {
            title: `${selected.length}건 · ${formatPrice(total)}`,
            items: [
              { type: 'action', label: ACTION_LABEL.pay, onPress: () => act('pay') },
              { type: 'action', label: ACTION_LABEL.release, onPress: () => act('release') },
              { type: 'action', label: ACTION_LABEL.hold, destructive: true, onPress: () => act('hold') },
            ],
          },
        },
      ]
    : [];

  return (
    <AdminList
      queryKey="settlements"
      fetcher={api.admin.settlements}
      header={header}
      footer={toolbar}
      headerItems={bulk}
      searchPlaceholder="주문번호 · 판매자"
      filters={[
        {
          key: 'status',
          label: '상태',
          options: STATUS_OPTIONS,
          initial: initialOf(STATUS_OPTIONS, status) ?? 'SCHEDULED',
        },
      ]}
      emptyTitle="정산 내역이 없어요."
      extraData={picked}
      separatorInset={CHECK_INSET}
      renderItem={(s) => <SettlementRow s={s} checked={picked.has(s.id)} onToggle={() => toggle(s)} />}
    />
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tabular: { fontVariant: ['tabular-nums'] },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
