import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { SellOnboardingIllustration } from '@/components/illustrations/sell-onboarding';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/state';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Text } from '@/components/ui/text';
import { CenteredScroll } from '@/components/ui/centered-scroll';
import { formatNumber } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 판매 탭: 작품 등록 바로가기 + 판매 현황 + 판매 관리 메뉴 (판매자가 아니면 판매자 등록 안내) */
export default function SellScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['sell', 'common']);
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
        title={tr('tab.loginTitle')}
        action={{ title: tr('gate.login'), onPress: () => router.push('/login') }}
      />
    );
  if (!user.isSeller) return <SellerOnboarding />;

  const s = stats.data;
  const tiles: { label: string; value: number | undefined; href: Href }[] = [
    {
      label: label('productStatus', 'ACTIVE'),
      value: s?.selling,
      href: { pathname: '/seller/products', params: { status: 'selling' } },
    },
    {
      label: label('productStatus', 'DRAFT'),
      value: s?.draft,
      href: { pathname: '/seller/products', params: { status: 'draft' } },
    },
    {
      label: label('productStatus', 'HIDDEN'),
      value: s?.hidden,
      href: { pathname: '/seller/products', params: { status: 'hidden' } },
    },
    {
      label: label('productStatus', 'SOLD'),
      value: s?.sold,
      href: { pathname: '/seller/products', params: { status: 'sold' } },
    },
    {
      label: tr('tab.ordersToShip'),
      value: s?.ordersToShip,
      href: { pathname: '/orders', params: { as: 'seller', filter: 'progress' } },
    },
    {
      label: tr('tab.liveAuctions'),
      value: s?.liveAuctions,
      href: { pathname: '/seller/products', params: { status: 'selling' } },
    },
  ];
  const menu: [Href, string][] = [
    ['/seller/products', tr('common:screen.sellerProducts')],
    [{ pathname: '/orders', params: { as: 'seller' } }, tr('tab.salesOrders')],
    ['/seller/settlements', tr('common:screen.settlements')],
    ['/seller/register', tr('tab.sellerInfo')],
  ];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Button title={tr('tab.newProduct')} size="lg" block onPress={() => router.push('/sell/new')} />
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
          {tr('tab.summary', {
            views: formatNumber(s.views),
            favorites: formatNumber(s.favorites),
            scheduled: s.scheduledAuctions,
            inquiries: s.unansweredInquiries,
          })}
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
    </ScrollView>
  );
}

/** 판매자 등록 전 안내: 그림 · 소개 · 등록 버튼 (모두 가운데 정렬) */
function SellerOnboarding() {
  const { t: tr } = useTranslation(['sell', 'common']);
  return (
    <CenteredScroll style={styles.onboarding}>
      <SellOnboardingIllustration width={220} />
      <View style={styles.center}>
        <Text variant="h2" style={styles.centerText}>
          {tr('tab.onboardingTitle')}
        </Text>
        <Text color="muted" style={styles.centerText}>
          {tr('tab.onboardingDescription')}
        </Text>
      </View>
      <Button
        title={tr('gate.registerSeller')}
        size="lg"
        block
        onPress={() => router.push('/seller/register')}
      />
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
  body: { padding: 16, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.8%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
