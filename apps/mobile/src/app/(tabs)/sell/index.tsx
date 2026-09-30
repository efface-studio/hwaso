import type { SellerStatsDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { SellOnboardingIllustration } from '@/components/illustrations/sell-onboarding';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Text } from '@/components/ui/text';
import { CenteredScroll } from '@/components/ui/centered-scroll';
import { formatNumber } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const products = (status: string): Href => ({ pathname: '/seller/products', params: { status } });

/**
 * 판매 탭: 지금 처리할 일 → 작품 현황 → 관리 메뉴. 작품 등록은 헤더 오른쪽 버튼.
 * 판매자가 아니면 판매자 등록 안내, 아직 작품이 없으면 첫 등록 안내.
 */
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
  if (stats.isPending) return <Loading variant="plain-list" />;
  const s = stats.data;
  if (s && isEmpty(s)) return <FirstProduct />;

  // 개수가 있는 일만 보인다 — 처리할 게 없으면 영역째 숨긴다
  const tasks: { label: string; count: string; n: number; href: Href }[] = s
    ? [
        {
          label: tr('tab.tasks.toShip'),
          count: tr('tab.countCases', { count: s.ordersToShip }),
          n: s.ordersToShip,
          href: { pathname: '/orders', params: { as: 'seller', filter: 'progress' } },
        },
        {
          label: tr('tab.tasks.inquiries'),
          count: tr('tab.countCases', { count: s.unansweredInquiries }),
          n: s.unansweredInquiries,
          href: products('selling'),
        },
        {
          label: tr('tab.tasks.drafts'),
          count: tr('tab.countItems', { count: s.draft }),
          n: s.draft,
          href: products('draft'),
        },
      ].filter((x) => x.n > 0)
    : [];
  const stat = (text: string, value: number | undefined, href: Href) => (
    <Pressable
      key={text}
      accessibilityRole="link"
      accessibilityLabel={`${text} ${value ?? 0}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.stat, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="bodyStrong">{value === undefined ? '–' : formatNumber(value)}</Text>
      <Text variant="caption" color="muted">
        {text}
      </Text>
    </Pressable>
  );
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
      {tasks.length > 0 && (
        <View>
          <Text variant="label" color="muted" style={styles.group}>
            {tr('tab.tasks.title')}
          </Text>
          {tasks.map((x) => (
            <Row key={x.label} label={x.label} value={x.count} strong href={x.href} />
          ))}
        </View>
      )}

      <View>
        <Text variant="label" color="muted" style={styles.group}>
          {tr('tab.products')}
        </Text>
        <View style={[styles.stats, { borderColor: t.colors.borderSoft }]}>
          {stat(label('productStatus', 'ACTIVE'), s?.selling, products('selling'))}
          {stat(tr('tab.auctions'), s?.liveAuctions, products('selling'))}
          {stat(label('productStatus', 'SOLD'), s?.sold, products('sold'))}
          {stat(label('productStatus', 'HIDDEN'), s?.hidden, products('hidden'))}
        </View>
        {s && (
          <Text variant="caption" color="muted" style={styles.insight}>
            {tr('tab.insights', {
              views: formatNumber(s.views),
              favorites: formatNumber(s.favorites),
              scheduled: formatNumber(s.scheduledAuctions),
            })}
          </Text>
        )}
      </View>

      <View>
        <Text variant="label" color="muted" style={styles.group}>
          {tr('tab.manage')}
        </Text>
        {menu.map(([href, text]) => (
          <Row key={text} label={text} href={href} />
        ))}
      </View>
    </ScrollView>
  );
}

/** 작품·주문이 하나도 없다 — 0 만 가득한 현황 대신 첫 등록을 안내한다 */
const isEmpty = (s: SellerStatsDto) =>
  s.selling + s.draft + s.hidden + s.sold + s.ordersToShip + s.liveAuctions + s.scheduledAuctions === 0;

function Row({
  label: text,
  value,
  strong,
  href,
}: {
  label: string;
  value?: string;
  strong?: boolean;
  href: Href;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={value ? `${text} ${value}` : text}
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.row,
        { borderColor: t.colors.borderSoft, minHeight: t.touch + 12, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={{ flex: 1 }}>{text}</Text>
      {value && (
        <Text variant={strong ? 'bodyStrong' : 'body'} color={strong ? 'primary' : 'muted'}>
          {value}
        </Text>
      )}
      <Text color="faint">›</Text>
    </Pressable>
  );
}

/** 판매자지만 아직 작품이 없다: 그림 · 안내 · 등록 버튼 (가운데) */
function FirstProduct() {
  const { t: tr } = useTranslation('sell');
  return (
    <CenteredScroll style={styles.onboarding}>
      <SellOnboardingIllustration width={180} />
      <View style={styles.center}>
        <Text variant="h2" style={styles.centerText}>
          {tr('tab.firstTitle')}
        </Text>
        <Text color="muted" style={styles.centerText}>
          {tr('tab.firstDescription')}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title={tr('tab.register')} size="lg" block onPress={() => router.push('/sell/new')} />
        <Button
          title={tr('tab.sellerInfo')}
          variant="ghost"
          block
          onPress={() => router.push('/seller/register')}
        />
      </View>
    </CenteredScroll>
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
  actions: { alignSelf: 'stretch', gap: 4 },
  body: { padding: 16, paddingBottom: 48 },
  group: { marginTop: 20, marginBottom: 4 },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    marginTop: 4,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  insight: { marginTop: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
