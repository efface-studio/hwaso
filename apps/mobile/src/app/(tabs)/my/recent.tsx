import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { CardList } from '@/components/product/card-list';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/state';
import { api } from '@/lib/api';

export default function RecentScreen() {
  const qc = useQueryClient();
  const { t: tr } = useTranslation(['product', 'common']);
  const q = useQuery({ queryKey: ['recent'], queryFn: api.market.recent });
  const pull = usePullRefresh(q.refetch);
  return (
    <>
      <Stack.Screen
        options={{
          title: tr('recent.title'),
          headerLargeTitle: false,
          headerRight: () =>
            q.data?.length ? (
              <Button
                title={tr('recent.clearAll')}
                size="sm"
                variant="ghost"
                onPress={() =>
                  Alert.alert(tr('recent.clearConfirm'), undefined, [
                    { text: tr('common:action.cancel'), style: 'cancel' },
                    {
                      text: tr('recent.clear'),
                      style: 'destructive',
                      onPress: () =>
                        void api.market
                          .clearRecent()
                          .then(() => qc.invalidateQueries({ queryKey: ['recent'] })),
                    },
                  ])
                }
              />
            ) : null,
        }}
      />
      <CardList
        items={q.data}
        loading={q.isPending}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        empty={<Empty title={tr('recent.empty')} />}
      />
    </>
  );
}
