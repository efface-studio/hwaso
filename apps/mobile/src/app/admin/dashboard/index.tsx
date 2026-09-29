import { formatPrice, type AdminDashboardDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useIsFocused, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AdminRow, RowSection } from '@/components/admin/row';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { api } from '@/lib/api';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

const CHART_H = 56;

type Dashboard = AdminDashboardDto;
type Series = Dashboard['series'];

const num = (v: number) => v.toLocaleString('ko-KR');
const time = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const today = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
/** 2026-09-16 → 9월 16일 */
const day = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

type Task = { label: string; count: number; href: Href; urgent?: boolean; detail?: string };

/** 지금 손봐야 하는 일만 (0건은 빼고, 급한 일 먼저) */
function tasksOf(d: Dashboard): Task[] {
  const all: Task[] = [
    {
      label: '환불 요청',
      count: d.issues.refundRequests,
      urgent: true,
      href: { pathname: '/admin/commerce', params: { tab: 'orders', status: 'REFUND_REQUESTED' } },
    },
    { label: '미처리 신고', count: d.issues.openReports, urgent: true, href: '/admin/ops/reports' },
    {
      label: '낙찰 후 미결제',
      detail: '최근 30일',
      count: d.issues.unpaidAuctions,
      urgent: true,
      href: { pathname: '/admin/catalog', params: { tab: 'auctions' } },
    },
    {
      label: '발송 대기',
      count: d.orders.toShip,
      href: { pathname: '/admin/commerce', params: { tab: 'orders', status: 'PAID' } },
    },
    {
      label: '인증서 검수',
      count: d.products.pendingCertificates,
      href: { pathname: '/admin/catalog', params: { tab: 'products', verification: 'PENDING' } },
    },
    {
      label: '판매자 인증',
      count: d.sellers.pendingVerification,
      href: { pathname: '/admin/members', params: { tab: 'sellers' } },
    },
    {
      label: '결제 대기',
      count: d.orders.paymentPending,
      href: { pathname: '/admin/commerce', params: { tab: 'orders', status: 'PAYMENT_PENDING' } },
    },
  ];
  return all.filter((x) => x.count > 0);
}

function TaskRow({ task }: { task: Task }) {
  return (
    <AdminRow
      title={
        <Text variant="body" numberOfLines={1}>
          {task.label}
        </Text>
      }
      value={
        <Text variant="bodyStrong" color={task.urgent ? 'destructive' : 'foreground'} style={styles.tabular}>
          {num(task.count)}
        </Text>
      }
      detail={task.detail}
      accessibilityRole="link"
      accessibilityLabel={`${task.label} ${num(task.count)}건${task.detail ? `, ${task.detail}` : ''}`}
      onPress={() => router.push(task.href)}
    />
  );
}

/** 금액 하나: 작은 이름 위에 숫자 (상자 없이 나란히 둔다) */
function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View
      style={styles.figure}
      accessible
      accessibilityLabel={[label, value, sub].filter(Boolean).join(', ')}
    >
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="h3" numberOfLines={1} adjustsFontSizeToFit style={styles.tabular}>
        {value}
      </Text>
      {sub && (
        <Text variant="caption" color="faint">
          {sub}
        </Text>
      )}
    </View>
  );
}

/** 매출: 오늘 · 최근 30일 · 14일 막대 (막대를 누르면 그날 수치가 위에 나온다) */
function Sales({ d }: { d: Dashboard }) {
  const t = useTheme();
  const [sel, setSel] = useState<number | null>(null);
  const series = d.series;
  const max = Math.max(1, ...series.map((s) => s.gmv));
  const picked = sel === null ? undefined : series[sel];
  const detail = (s: Series[number]) => `${day(s.date)} · ${formatPrice(s.gmv)} · 주문 ${s.orders}건`;

  return (
    <View style={styles.sales}>
      <View style={styles.figures}>
        <Figure label="오늘" value={formatPrice(d.orders.gmvToday)} sub={`결제 ${num(d.orders.today)}건`} />
        <View style={[styles.divider, { backgroundColor: t.colors.border }]} />
        <Figure label="최근 30일" value={formatPrice(d.orders.gmv30d)} />
      </View>

      <View style={styles.chart}>
        <Text variant="caption" color={picked ? 'foreground' : 'faint'} numberOfLines={1}>
          {picked ? detail(picked) : '최근 14일 · 막대를 누르면 그날 수치를 보여줘요'}
        </Text>
        <View style={[styles.bars, { height: CHART_H }]}>
          {series.map((s, i) => {
            const on = sel === i;
            const last = i === series.length - 1;
            return (
              <Pressable
                key={s.date}
                accessibilityRole="button"
                accessibilityLabel={detail(s)}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  selectionHaptic();
                  setSel(on ? null : i);
                }}
                style={styles.barSlot}
              >
                {/* 0원인 날도 자리가 보이게 얇은 바닥선을 둔다 */}
                <View
                  style={{
                    height: s.gmv > 0 ? Math.max(3, (s.gmv / max) * CHART_H) : 2,
                    borderRadius: 1.5,
                    backgroundColor: s.gmv > 0 ? t.colors.primary : t.colors.border,
                    opacity: sel === null ? (last ? 1 : 0.55) : on ? 1 : 0.25,
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function DashboardSkeleton() {
  return (
    <View style={styles.pad}>
      <Skeleton width={140} height={14} radius={4} />
      <View style={{ marginTop: 28, gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={20} radius={4} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 36 }}>
        <Skeleton width="45%" height={44} radius={6} />
        <Skeleton width="45%" height={44} radius={6} />
      </View>
      <Skeleton height={CHART_H + 20} radius={6} style={{ marginTop: 20 }} />
    </View>
  );
}

/**
 * 관리자 요약: 오늘 날짜 → 지금 확인할 일(0건은 숨김) → 매출 → 운영 현황.
 * 1분마다 새로 불러오고, 다른 탭을 보는 동안에는 멈춘다.
 */
export default function AdminDashboardScreen() {
  const t = useTheme();
  const q = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: api.admin.dashboard,
    refetchInterval: 60_000,
    subscribed: useIsFocused(),
  });
  const pull = usePullRefresh(q.refetch);
  const d = q.data;

  let body;
  if (!d || pull.refreshing) {
    body =
      q.isError && !d ? (
        <Empty
          kind="error"
          title="불러오지 못했어요"
          action={{ title: '다시 시도', onPress: () => void q.refetch() }}
        />
      ) : (
        <DashboardSkeleton />
      );
  } else {
    const tasks = tasksOf(d);
    body = (
      <>
        <View style={[styles.pad, styles.dateLine]}>
          <Text variant="bodyStrong">{today(q.dataUpdatedAt)}</Text>
          <Text variant="caption" color="faint">
            {time(q.dataUpdatedAt)} 기준
          </Text>
        </View>

        {tasks.length > 0 ? (
          <RowSection title={`확인할 일 ${tasks.length}`}>
            {tasks.map((task) => (
              <TaskRow key={task.label} task={task} />
            ))}
          </RowSection>
        ) : (
          <View style={[styles.pad, styles.clear]}>
            <Icon ios="checkmark.circle" android="check_circle" color="primary" size={18} />
            <Text variant="small" color="muted">
              지금 확인할 일이 없어요.
            </Text>
          </View>
        )}

        <Text variant="label" color="muted" accessibilityRole="header" style={styles.sectionTitle}>
          매출
        </Text>
        <Sales d={d} />

        <RowSection title="운영 현황" footer="오늘은 한국 시간 0시부터 집계해요.">
          <AdminRow
            title={<Text variant="body">진행 중 경매</Text>}
            value={<Text style={styles.tabular}>{num(d.auctions.live)}</Text>}
            detail={`오늘 마감 ${d.auctions.endingToday} · 예정 ${d.auctions.scheduled}`}
            accessibilityRole="link"
            onPress={() =>
              router.push({ pathname: '/admin/catalog', params: { tab: 'auctions', status: 'LIVE' } })
            }
          />
          <AdminRow
            title={<Text variant="body">회원</Text>}
            value={<Text style={styles.tabular}>{num(d.users.total)}</Text>}
            detail={`오늘 가입 ${d.users.today} · 정지 ${d.users.suspended}`}
            accessibilityRole="link"
            onPress={() => router.push('/admin/members')}
          />
          <AdminRow
            title={<Text variant="body">판매 중 작품</Text>}
            value={<Text style={styles.tabular}>{num(d.products.active)}</Text>}
          />
          <AdminRow
            title={<Text variant="body">정산 예정</Text>}
            value={<Text style={styles.tabular}>{formatPrice(d.settlements.scheduledAmount)}</Text>}
            detail={`보류 ${formatPrice(d.settlements.heldAmount)}`}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/admin/commerce', params: { tab: 'settlements' } })}
          />
        </RowSection>
      </>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 48 },
  pad: { paddingHorizontal: 16 },
  tabular: { fontVariant: ['tabular-nums'] },
  dateLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 24 },
  sectionTitle: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 10 },
  sales: { paddingHorizontal: 16, gap: 18 },
  figures: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  figure: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
  chart: { gap: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', paddingHorizontal: 2.5 },
});
