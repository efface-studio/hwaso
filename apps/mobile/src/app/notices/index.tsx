import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

const SIZE = 20;

/** 공지사항 목록 (고정 공지가 먼저) */
export default function NoticesScreen() {
  const t = useTheme();
  const q = useInfiniteQuery({
    queryKey: ['notices'],
    queryFn: ({ pageParam }) => api.notices.list({ page: pageParam, size: SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.size < last.total ? last.page + 1 : undefined),
  });
  if (q.isPending) return <Loading />;
  return (
    <FlatList
      style={{ backgroundColor: t.colors.background }}
      data={q.data?.pages.flatMap((p) => p.items) ?? []}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
      ListHeaderComponent={<Stack.Screen options={{ title: '공지사항' }} />}
      ListEmptyComponent={<Empty title="공지사항이 없어요" />}
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
            {new Date(n.publishedAt).toLocaleDateString('ko-KR')}
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
