import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { Chips } from '@/components/ui/chips';
import { ArtistRail } from '@/components/home/artist-rail';
import { BannerCarousel } from '@/components/home/banners';
import { Rail } from '@/components/home/rail';
import { Text } from '@/components/ui/text';
import { Empty, Loading } from '@/components/ui/state';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

export default function HomeScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['home'], queryFn: api.market.home });
  const cats = useQuery({ queryKey: ['categories'], queryFn: api.market.categories, staleTime: 3_600_000 });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data)
    return (
      <Empty
        title="홈을 불러오지 못했어요"
        description="네트워크를 확인하고 다시 시도해주세요."
        action={{ title: '다시 시도', onPress: () => void q.refetch() }}
      />
    );
  const h = q.data;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <BannerCarousel banners={h.banners} />
      {h.notices[0] && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/notices/[id]', params: { id: h.notices[0]!.id } })}
          style={[styles.notice, { borderColor: t.colors.borderSoft }]}
        >
          <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>
            공지
          </Text>
          <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
            {h.notices[0].title}
          </Text>
          <Text color="faint">›</Text>
        </Pressable>
      )}
      {!!cats.data?.length && (
        <Chips
          label="카테고리"
          value=""
          onChange={(slug) => router.push({ pathname: '/category/[slug]', params: { slug } })}
          options={cats.data.map((c) => ({ value: c.slug, label: c.name }))}
        />
      )}
      <Rail title="지금 진행 중인 경매" items={h.liveAuctions} />
      <Rail title="곧 마감되는 경매" items={h.endingSoon} />
      <Rail title="곧 시작하는 경매" items={h.upcomingAuctions} />
      <Rail title="새로 들어온 작품" items={h.newArrivals} />
      <ArtistRail artists={h.popularArtists} />
      <Rail title="인기 작품" items={h.popular} />
      {h.collections.map((c) => (
        <Rail key={c.category.slug} title={c.category.name} items={c.items} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
