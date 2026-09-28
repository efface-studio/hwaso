import { formatRelativeTime, type ChatRoomDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

function Row({ r }: { r: ChatRoomDto }) {
  const t = useTheme();
  return (
    <Link href={{ pathname: '/chat/[id]', params: { id: r.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${r.counterpart.nickname}, ${r.lastMessage?.preview ?? ''}${r.unreadCount ? `, 안 읽은 메시지 ${r.unreadCount}개` : ''}`}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.colors.surface2 : 'transparent', minHeight: t.touch + 28 }]}
      >
        <Avatar avatarKey={r.counterpart.avatarKey} name={r.counterpart.nickname} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.top}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
              {r.counterpart.nickname}
            </Text>
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
          <Image source={mediaUrl(r.product.image.key, 400)} style={[styles.thumb, { backgroundColor: r.product.image.dominantColor }]} contentFit="cover" />
        )}
      </Pressable>
    </Link>
  );
}

export default function ChatListScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const q = useQuery({ queryKey: ['chat', 'rooms'], queryFn: api.chat.rooms, enabled: !!user });
  if (!user) return <Empty title="로그인하고 판매자와 대화해보세요" action={{ title: '로그인', onPress: () => router.push('/login') }} />;
  if (q.isPending) return <Loading />;
  return (
    <FlatList
      data={q.data ?? []}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <Row r={item} />}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.borderSoft, marginLeft: 76 }} />}
      ListEmptyComponent={<Empty title="아직 대화가 없어요" description="작품 상세에서 판매자에게 궁금한 점을 물어보세요." />}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  thumb: { width: 44, height: 44 },
});
