import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { CardList } from '@/components/product/card-list';
import { Empty } from '@/components/ui/state';
import { api } from '@/lib/api';

export default function FavoritesScreen() {
  const { t: tr } = useTranslation('product');
  const q = useQuery({ queryKey: ['favorites'], queryFn: api.market.favorites });
  const pull = usePullRefresh(q.refetch);
  return (
    <>
      <Stack.Screen options={{ title: tr('favorites.title'), headerLargeTitle: false }} />
      <CardList
        items={q.data}
        loading={q.isPending}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        empty={
          <Empty
            kind="heart"
            title={tr('favorites.empty')}
            description={tr('favorites.emptyDescription')}
            action={{ title: tr('favorites.browse'), onPress: () => router.push('/home') }}
          />
        }
      />
    </>
  );
}
