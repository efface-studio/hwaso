import type { NotificationDto } from '@shop/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, type Href } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { useInfinitePullRefresh } from '@/hooks/use-pull-refresh';
import { Empty, Loading } from '@/components/ui/state';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { List } from '@/components/ui/list';
import i18n, { currentLanguage } from '@/i18n';
import { dateTimeFormat } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return i18n.t('common:time.justNow');
  if (s < 3600) return i18n.t('common:time.minutesAgo', { count: Math.floor(s / 60) });
  if (s < 86400) return i18n.t('common:time.hoursAgo', { count: Math.floor(s / 3600) });
  return dateTimeFormat({ month: 'long', day: 'numeric' }).format(new Date(iso));
};

/**
 * 알림 제목은 서버가 한국어로 만들어 보낸다. 다른 언어에서는 종류 이름으로 보여준다
 * (운영 공지(SYSTEM)는 제목 자체가 내용이라 그대로 둔다)
 */
const titleOf = (n: NotificationDto) =>
  currentLanguage() === 'ko' || n.type === 'SYSTEM' ? n.title : label('notificationType', n.type);

/** 알림 한 줄. 바뀌지 않은 알림은 다시 그리지 않는다 */
const Row = memo(function Row({
  n,
  onOpen,
  onRemove,
}: {
  n: NotificationDto;
  onOpen: (n: NotificationDto) => Promise<void>;
  onRemove: (n: NotificationDto) => void;
  /** 다시 불러올 때마다 바뀌어, 상대 시각(n분 전)을 새로 계산하게 한다 */
  updatedAt: number;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('my');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !n.readAt }}
      accessibilityHint={tr('notifications.deleteHint')}
      onPress={() => void onOpen(n)}
      onLongPress={() => onRemove(n)}
      style={[
        styles.row,
        { minHeight: t.touch, backgroundColor: n.readAt ? undefined : t.colors.primarySoft },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{titleOf(n)}</Text>
        <Text variant="small" color="foreground2">
          {n.body}
        </Text>
        <Text variant="caption" color="muted">
          {ago(n.createdAt)}
        </Text>
      </View>
      {!n.readAt && (
        <View
          accessibilityLabel={tr('notifications.unread')}
          style={[styles.dot, { backgroundColor: t.colors.primary }]}
        />
      )}
    </Pressable>
  );
});

/** 알림함: 누르면 읽음 처리 후 해당 화면으로, 길게 눌러 삭제 */
const Sep = () => <Separator />;

export default function NotificationsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.notifications.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
  });
  const pull = useInfinitePullRefresh(['notifications', 'list'], q.refetch);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  }, [qc]);
  const open = useCallback(
    async (n: NotificationDto) => {
      if (!n.readAt) await api.notifications.read({ ids: [n.id] }).then(refresh, () => undefined);
      if (n.link) router.push(n.link as Href);
    },
    [refresh],
  );
  const remove = useCallback(
    (n: NotificationDto) =>
      Alert.alert(tr('notifications.deleteConfirm'), undefined, [
        { text: tr('common:action.cancel'), style: 'cancel' },
        {
          text: tr('common:action.delete'),
          style: 'destructive',
          onPress: () => void api.notifications.remove(n.id).then(refresh),
        },
      ]),
    [tr, refresh],
  );
  const updatedAt = q.dataUpdatedAt;
  const renderItem = useCallback<ListRenderItem<NotificationDto>>(
    ({ item }) => <Row n={item} onOpen={open} onRemove={remove} updatedAt={updatedAt} />,
    [open, remove, updatedAt],
  );
  const menu = () =>
    Alert.alert(tr('notifications.inbox'), undefined, [
      {
        text: tr('notifications.markAllRead'),
        onPress: () => void api.notifications.read({ all: true }).then(refresh),
      },
      {
        text: tr('notifications.clearRead'),
        style: 'destructive',
        onPress: () => void api.notifications.clearRead().then(refresh),
      },
      { text: tr('common:action.cancel'), style: 'cancel' },
    ]);

  if (!me)
    return (
      <Empty
        kind="lock"
        title={tr('notifications.loginRequired')}
        action={{ title: tr('notifications.login'), onPress: () => router.push('/login') }}
      />
    );
  if (q.isPending) return <Loading variant="list" />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: tr('common:screen.notifications'),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('notifications.menuA11y')}
              onPress={menu}
              hitSlop={10}
            >
              <Icon ios="ellipsis.circle" android="more_horiz" />
            </Pressable>
          ),
        }}
      />
      <List
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ backgroundColor: t.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        ListEmptyComponent={
          <Empty
            kind="bell"
            title={tr('notifications.emptyTitle')}
            description={tr('notifications.emptyDescription')}
          />
        }
        ItemSeparatorComponent={Sep}
        renderItem={renderItem}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
