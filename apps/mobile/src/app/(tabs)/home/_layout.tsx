import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

function HeaderActions() {
  const t = useTheme();
  const signedIn = !!useAuthStore((s) => s.user);
  const q = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: api.notifications.unreadCount,
    enabled: signedIn,
    refetchInterval: 60_000,
  });
  const unread = q.data?.unreadCount ?? 0;
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="검색" onPress={() => router.push('/search')} hitSlop={10}>
        <Text variant="bodyStrong">검색</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread ? `알림 ${unread}개 안 읽음` : '알림'}
        onPress={() => router.push(signedIn ? '/notifications' : '/login')}
        hitSlop={10}
      >
        <Text variant="bodyStrong">알림</Text>
        {unread > 0 && (
          <View style={[styles.badge, { backgroundColor: t.colors.destructive }]}>
            <Text variant="caption" style={{ color: '#fff', fontSize: 10, lineHeight: 14 }}>
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

export default function Layout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTitleStyle: t.type('h3'),
        headerLargeTitleShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: '화소', headerRight: () => <HeaderActions /> }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    minWidth: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
});
