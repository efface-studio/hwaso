import { CHAT_ROOM_FILTERS, filterChatRooms, type ChatRoomDto, type ChatRoomFilter } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizePreview } from '@/components/chat/localize';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Avatar } from '@/components/ui/avatar';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { List } from '@/components/ui/list';
import { formatRelative } from '@/i18n/format';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 방 한 줄. 검색어·필터가 바뀌어도 그대로인 방은 다시 그리지 않는다 */
const Row = memo(function Row({
  r,
}: {
  r: ChatRoomDto;
  /** 다시 불러올 때마다 바뀌어, 상대 시각(n분 전)을 새로 계산하게 한다 */
  updatedAt: number;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('chat');
  const preview = r.lastMessage && localizePreview(r.lastMessage);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: r.id } })}
      accessibilityRole="link"
      accessibilityLabel={[
        r.pinned && tr('list.a11yPinned'),
        r.counterpart.nickname,
        preview ?? '',
        r.unreadCount > 0 && tr('list.a11yUnread', { count: r.unreadCount }),
      ]
        .filter((part) => part !== false)
        .join(', ')}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? t.colors.surface2 : 'transparent', minHeight: t.touch + 28 },
      ]}
    >
      <Avatar avatarKey={r.counterpart.avatarKey} name={r.counterpart.nickname} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.top}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {r.counterpart.nickname}
          </Text>
          {r.pinned && (
            <Text variant="caption" color="faint">
              {tr('list.pinned')}
            </Text>
          )}
          {r.muted && (
            <Text variant="caption" color="faint">
              {tr('list.muted')}
            </Text>
          )}
          {r.lastMessage && (
            <Text variant="caption" color="faint">
              {formatRelative(r.lastMessage.createdAt)}
            </Text>
          )}
        </View>
        <Text variant="small" color="muted" numberOfLines={1}>
          {preview ?? r.product?.title}
        </Text>
      </View>
      {r.unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: t.colors.primary }]}>
          <Text variant="caption" color="primaryForeground">
            {r.unreadCount > 99 ? '99+' : r.unreadCount}
          </Text>
        </View>
      )}
      {r.product?.image && (
        <Image
          source={mediaUrl(r.product.image.key, 400)}
          style={[styles.thumb, { backgroundColor: r.product.image.dominantColor }]}
          contentFit="cover"
        />
      )}
    </Pressable>
  );
});

/** 채팅 목록: 고정한 방 먼저, 구매·판매·안 읽음 필터, 헤더 검색(닉네임·작품명) */
/** 사진(44) 뒤 글자 시작점까지 들여 쓴 구분선 */
const Sep = () => <Separator inset={76} soft />;

export default function ChatListScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('chat');
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState<ChatRoomFilter>('all');
  const [query, setQuery] = useState('');
  const q = useQuery({ queryKey: ['chat', 'rooms'], queryFn: api.chat.rooms, enabled: !!user });
  const pull = usePullRefresh(q.refetch);
  const updatedAt = q.dataUpdatedAt;
  const renderItem = useCallback<ListRenderItem<ChatRoomDto>>(
    ({ item }) => <Row r={item} updatedAt={updatedAt} />,
    [updatedAt],
  );
  if (!user)
    return (
      <Empty
        kind="lock"
        title={tr('list.loginTitle')}
        action={{ title: tr('login'), onPress: () => router.push('/login') }}
      />
    );
  if (q.isPending) return <Loading variant="list" />;
  const all = q.data ?? [];
  return (
    <List
      contentContainerStyle={{ flexGrow: 1 }}
      data={filterChatRooms(all, filter, query)}
      keyExtractor={(r) => r.id}
      renderItem={renderItem}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      ItemSeparatorComponent={Sep}
      ListHeaderComponent={
        <>
          <Stack.Screen
            options={{
              headerSearchBarOptions: {
                placeholder: tr('list.searchPlaceholder'),
                hideWhenScrolling: false,
                onChangeText: (e) => setQuery(e.nativeEvent.text),
                onCancelButtonPress: () => setQuery(''),
              },
            }}
          />
          {all.length > 0 && (
            <View style={{ paddingVertical: 8 }}>
              <Chips
                label={tr('list.filterLabel')}
                value={filter}
                onChange={setFilter}
                options={CHAT_ROOM_FILTERS.map(([value]) => ({ value, label: tr(`list.filter.${value}`) }))}
              />
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        all.length ? (
          <Empty kind="search" title={query.trim() ? tr('list.noResults') : tr('list.noMatches')} />
        ) : (
          <Empty kind="chat" title={tr('list.empty.title')} description={tr('list.empty.description')} />
        )
      }
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  thumb: { width: 44, height: 44 },
});
