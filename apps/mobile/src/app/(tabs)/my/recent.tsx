import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Alert } from 'react-native';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { CardList } from '@/components/product/card-list';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/state';
import { api } from '@/lib/api';

export default function RecentScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['recent'], queryFn: api.market.recent });
  const pull = usePullRefresh(q.refetch);
  return (
    <>
      <Stack.Screen
        options={{
          title: '최근 본 작품',
          headerLargeTitle: false,
          headerRight: () =>
            q.data?.length ? (
              <Button
                title="모두 지우기"
                size="sm"
                variant="ghost"
                onPress={() =>
                  Alert.alert('최근 본 작품을 모두 지울까요?', undefined, [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '지우기',
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
        empty={<Empty title="최근 본 작품이 없어요" />}
      />
    </>
  );
}
