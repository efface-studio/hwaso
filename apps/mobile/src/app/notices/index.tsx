import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { formatDate } from '@/i18n/format';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

const SIZE = 20;

/** 공지사항 목록 (고정 공지가 먼저) */
export default function NoticesScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['home', 'common']);
  const q = useInfiniteQuery({
    queryKey: ['notices'],
    queryFn: ({ pageParam }) => api.notices.list({ page: pageParam, size: SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.size < last.total ? last.page + 1 : undefined),
  });
  const pull = usePullRefresh(q.refetch);
  if (q.isPending) return <Loading variant="plain-list" />;
  return (
    <List
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ backgroundColor: t.colors.background }}
      data={pull.refreshing ? [] : (q.data?.pages.flatMap((p) => p.items) ?? [])}
      keyExtractor={(n) => n.id}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={<Stack.Screen options={{ title: tr('common:screen.notices') }} />}
      ListEmptyComponent={
        pull.refreshing ? <Loading variant="plain-list" /> : <Empty kind="doc" title={tr('notices.empty')} />
      }
      renderItem={({ item: n }) => (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/notices/[id]', params: { id: n.id } })}
          style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}
        >
          <Text variant="bodyStrong" numberOfLines={2}>
            {n.isPinned ? '📌 ' : ''}
            {n.title}
          </Text>
          <Text variant="caption" color="muted">
            {formatDate(n.publishedAt)}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
