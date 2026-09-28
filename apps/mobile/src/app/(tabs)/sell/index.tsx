import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
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

  if (!user)
    return (
      <Empty
        title="작품을 판매하려면 로그인해주세요"
        action={{ title: '로그인', onPress: () => router.push('/login') }}
      />
    );
  if (!user.isSeller)
    return (
      <Empty
        title="화소에서 작품을 판매해보세요"
        description="판매 대금을 받을 계좌만 등록하면 사진 촬영부터 경매 예약까지 앱에서 바로 할 수 있어요."
        action={{ title: '판매자 등록하기', onPress: () => router.push('/seller/register') }}
      />
    );

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
      refreshControl={
        <RefreshControl refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()} />
      }
    >
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
          누적 조회 {s.views.toLocaleString('ko-KR')} · 관심 {s.favorites.toLocaleString('ko-KR')} · 예약 경매{' '}
          {s.scheduledAuctions} · 답변 대기 문의 {s.unansweredInquiries}
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

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.8%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
