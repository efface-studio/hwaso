import {
  CHAT_ROOM_FILTERS,
  filterChatRooms,
  formatRelativeTime,
  type ChatRoomDto,
  type ChatRoomFilter,
} from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

function Row({ r }: { r: ChatRoomDto }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: r.id } })}
      accessibilityRole="link"
      accessibilityLabel={`${r.pinned ? '고정됨, ' : ''}${r.counterpart.nickname}, ${r.lastMessage?.preview ?? ''}${r.unreadCount ? `, 안 읽은 메시지 ${r.unreadCount}개` : ''}`}
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
              고정
            </Text>
          )}
          {r.muted && (
            <Text variant="caption" color="faint">
              알림 끔
            </Text>
          )}
          {r.lastMessage && (
            <Text variant="caption" color="faint">
              {formatRelativeTime(r.lastMessage.createdAt)}
            </Text>
          )}
        </View>
        <Text variant="small" color="muted" numberOfLines={1}>
          {r.lastMessage?.preview ?? r.product?.title}
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
}

/** 채팅 목록: 고정한 방 먼저, 구매·판매·안 읽음 필터, 헤더 검색(닉네임·작품명) */
export default function ChatListScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState<ChatRoomFilter>('all');
  const [query, setQuery] = useState('');
  const q = useQuery({ queryKey: ['chat', 'rooms'], queryFn: api.chat.rooms, enabled: !!user });
  if (!user)
    return (
      <Empty
        title="로그인하고 판매자와 대화해보세요"
        action={{ title: '로그인', onPress: () => router.push('/login') }}
      />
    );
  if (q.isPending) return <Loading />;
  const all = q.data ?? [];
  return (
    <FlatList
      data={filterChatRooms(all, filter, query)}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <Row r={item} />}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      ItemSeparatorComponent={() => (
        <View
          style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.borderSoft, marginLeft: 76 }}
        />
      )}
      ListHeaderComponent={
        <>
          <Stack.Screen
            options={{
              headerSearchBarOptions: {
                placeholder: '닉네임, 작품명 검색',
                hideWhenScrolling: false,
                onChangeText: (e) => setQuery(e.nativeEvent.text),
                onCancelButtonPress: () => setQuery(''),
              },
            }}
          />
          {all.length > 0 && (
            <View style={{ paddingVertical: 8 }}>
              <Chips
                label="채팅 필터"
                value={filter}
                onChange={setFilter}
                options={CHAT_ROOM_FILTERS.map(([value, label]) => ({ value, label }))}
              />
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        all.length ? (
          <Empty title={query.trim() ? '검색 결과가 없어요' : '해당하는 대화가 없어요'} />
        ) : (
          <Empty title="아직 대화가 없어요" description="작품 상세에서 판매자에게 궁금한 점을 물어보세요." />
        )
      }
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
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
