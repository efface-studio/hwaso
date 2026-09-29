import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { CardList } from '@/components/product/card-list';
import { Empty } from '@/components/ui/state';
import { api } from '@/lib/api';

export default function FavoritesScreen() {
  const q = useQuery({ queryKey: ['favorites'], queryFn: api.market.favorites });
  const pull = usePullRefresh(q.refetch);
  return (
    <>
      <Stack.Screen options={{ title: '관심 작품', headerLargeTitle: false }} />
      <CardList
        items={q.data}
        loading={q.isPending}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        empty={
          <Empty
            kind="heart"
            title="관심 작품이 없어요"
            description="마음에 드는 작품의 ♡ 를 눌러 모아보세요."
            action={{ title: '작품 둘러보기', onPress: () => router.push('/home') }}
          />
        }
      />
    </>
  );
}
