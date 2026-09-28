import type { NotificationDto } from '@shop/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, type Href } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

/** 알림함: 누르면 읽음 처리 후 해당 화면으로, 길게 눌러 삭제 */
export default function NotificationsScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const open = async (n: NotificationDto) => {
    if (!n.readAt) await api.notifications.read({ ids: [n.id] }).then(refresh, () => undefined);
    if (n.link) router.push(n.link as Href);
  };
  const remove = (n: NotificationDto) =>
    Alert.alert('알림을 삭제할까요?', undefined, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void api.notifications.remove(n.id).then(refresh) },
    ]);
  const menu = () =>
    Alert.alert('알림함', undefined, [
      { text: '모두 읽음', onPress: () => void api.notifications.read({ all: true }).then(refresh) },
      { text: '읽은 알림 삭제', style: 'destructive', onPress: () => void api.notifications.clearRead().then(refresh) },
      { text: '취소', style: 'cancel' },
    ]);

  if (!me) return <Empty title="로그인이 필요해요" action={{ title: '로그인', onPress: () => router.push('/login') }} />;
  if (q.isPending) return <Loading />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: '알림',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="알림함 메뉴" onPress={menu} hitSlop={10}>
              <Text variant="h3">⋯</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: t.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        ListEmptyComponent={<Empty title="새 알림이 없어요" description="입찰·주문·채팅 소식을 여기서 알려드려요." />}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }} />
        )}
        renderItem={({ item: n }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !n.readAt }}
            accessibilityHint="길게 눌러 삭제"
            onPress={() => void open(n)}
            onLongPress={() => remove(n)}
            style={[styles.row, { minHeight: t.touch, backgroundColor: n.readAt ? undefined : t.colors.primarySoft }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{n.title}</Text>
              <Text variant="small" color="foreground2">
                {n.body}
              </Text>
              <Text variant="caption" color="muted">
                {ago(n.createdAt)}
              </Text>
            </View>
            {!n.readAt && (
              <View accessibilityLabel="읽지 않음" style={[styles.dot, { backgroundColor: t.colors.primary }]} />
            )}
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
