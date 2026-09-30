import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { SellOnboardingIllustration } from '@/components/illustrations/sell-onboarding';
import { Button } from '@/components/ui/button';
import { Empty, RefreshSkeleton } from '@/components/ui/state';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Text } from '@/components/ui/text';
import { CenteredScroll } from '@/components/ui/centered-scroll';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 판매 탭: 작품 등록 바로가기 + 판매 현황 + 판매 관리 메뉴 (판매자가 아니면 판매자 등록 안내) */
export default function SellScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const stats = useQuery({
    queryKey: ['seller', 'stats'],
    queryFn: api.market.sellerStats,
    enabled: !!user?.isSeller,
  });
  const pull = usePullRefresh(stats.refetch);

  if (!user)
    return (
      <Empty
        kind="lock"
        title="작품을 판매하려면 로그인해주세요"
        action={{ title: '로그인', onPress: () => router.push('/login') }}
      />
    );
  if (!user.isSeller) return <SellerOnboarding />;

  const s = stats.data;
  const tiles: { label: string; value: number | undefined; href: Href }[] = [
    {
      label: '판매 중',
      value: s?.selling,
      href: { pathname: '/seller/products', params: { status: 'selling' } },
    },
    {
      label: '임시 저장',
      value: s?.draft,
      href: { pathname: '/seller/products', params: { status: 'draft' } },
    },
    {
      label: '판매 중지',
      value: s?.hidden,
      href: { pathname: '/seller/products', params: { status: 'hidden' } },
    },
    {
      label: '판매 완료',
      value: s?.sold,
      href: { pathname: '/seller/products', params: { status: 'sold' } },
    },
    {
      label: '발송 대기',
      value: s?.ordersToShip,
      href: { pathname: '/orders', params: { as: 'seller', filter: 'progress' } },
    },
    {
      label: '진행 경매',
      value: s?.liveAuctions,
      href: { pathname: '/seller/products', params: { status: 'selling' } },
    },
  ];
  const menu: [Href, string][] = [
    ['/seller/products', '내 작품'],
    [{ pathname: '/orders', params: { as: 'seller' } }, '판매 주문'],
    ['/seller/settlements', '정산'],
    ['/seller/register', '판매자 정보 · 정산 계좌'],
  ];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <RefreshSkeleton refreshing={pull.refreshing} variant="plain-list">
        <Button title="+ 작품 등록하기" size="lg" block onPress={() => router.push('/sell/new')} />
        <View style={styles.grid}>
          {tiles.map((x) => (
            <Pressable
              key={x.label}
              accessibilityRole="link"
              accessibilityLabel={`${x.label} ${x.value ?? 0}`}
              onPress={() => router.push(x.href)}
              style={[styles.tile, { borderColor: t.colors.border }]}
            >
              <Text variant="caption" color="muted">
                {x.label}
              </Text>
              <Text variant="h2">{x.value ?? '–'}</Text>
            </Pressable>
          ))}
        </View>
        {s && (
          <Text variant="small" color="muted">
            누적 조회 {s.views.toLocaleString('ko-KR')} · 관심 {s.favorites.toLocaleString('ko-KR')} · 예약
            경매 {s.scheduledAuctions} · 답변 대기 문의 {s.unansweredInquiries}
          </Text>
        )}
        <View style={{ marginTop: 8 }}>
          {menu.map(([href, label]) => (
            <Pressable
              key={label}
              accessibilityRole="link"
              onPress={() => router.push(href)}
              style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}
            >
              <Text style={{ flex: 1 }}>{label}</Text>
              <Text color="faint">›</Text>
            </Pressable>
          ))}
        </View>
      </RefreshSkeleton>
    </ScrollView>
  );
}

/** 판매자 등록 전 안내: 그림 · 소개 · 등록 3단계 · 등록 버튼 (모두 가운데 정렬) */
function SellerOnboarding() {
  const t = useTheme();
  const steps = [
    ['1', '본인인증과 정산 계좌 등록', '판매 대금을 받을 계좌를 한 번만 등록해요.'],
    ['2', '작품 사진 찍고 정보 입력', '작가·재료·크기·상태를 적으면 끝이에요.'],
    ['3', '즉시 판매 또는 경매 예약', '원하는 방식으로 컬렉터를 만나요.'],
  ] as const;
  return (
    <CenteredScroll style={styles.onboarding}>
      <SellOnboardingIllustration width={220} />
      <View style={styles.center}>
        <Text variant="h2" style={styles.centerText}>
          화소에서 작품을 판매해보세요
        </Text>
        <Text color="muted" style={styles.centerText}>
          판매 대금을 받을 계좌만 등록하면{'\n'}사진 촬영부터 경매 예약까지 앱에서 바로 할 수 있어요.
        </Text>
      </View>
      <View style={[styles.steps, { backgroundColor: t.colors.surface2, borderRadius: t.radius.lg }]}>
        {steps.map(([n, title, desc]) => (
          <View key={n} style={styles.step}>
            <View style={[styles.stepNo, { backgroundColor: t.colors.primary }]}>
              <Text variant="label" color="primaryForeground">
                {n}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{title}</Text>
              <Text variant="small" color="muted">
                {desc}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Button title="판매자 등록하기" size="lg" block onPress={() => router.push('/seller/register')} />
    </CenteredScroll>
  );
}

const styles = StyleSheet.create({
  onboarding: {
    alignItems: 'center',
    padding: 24,
    gap: 24,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  center: { alignItems: 'center', gap: 8 },
  centerText: { textAlign: 'center' },
  steps: { alignSelf: 'stretch', padding: 16, gap: 14 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNo: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.8%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
