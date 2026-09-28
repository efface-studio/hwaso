import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { RefreshControl, ScrollView } from 'react-native';
import { Chips } from '@/components/ui/chips';
import { Rail } from '@/components/home/rail';
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
      <Rail title="새로 들어온 작품" items={h.newArrivals} />
      <Rail title="인기 작품" items={h.popular} />
      {h.collections.map((c) => (
        <Rail key={c.category.slug} title={c.category.name} items={c.items} />
      ))}
    </ScrollView>
  );
}
