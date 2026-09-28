import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/**
 * 하단 탭 — 네이티브 탭 바 (iOS 26 에서는 시스템 Liquid Glass, Android 는 Material 3).
 * 웹과 같은 순서: 홈 · 경매 · 판매 · 채팅 · 마이
 */
export default function TabsLayout() {
  const t = useTheme();
  const signedIn = !!useAuthStore((s) => s.user);
  const chat = useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: api.chat.unreadCount,
    enabled: signedIn,
    refetchInterval: 60_000,
  });
  const unread = chat.data?.unreadCount ?? 0;
  return (
    <NativeTabs tintColor={t.colors.primary} labelStyle={{ fontSize: t.senior ? 13 : 11 }}>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>홈</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="auctions">
        <NativeTabs.Trigger.Label>경매</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'hammer', selected: 'hammer.fill' }} md="gavel" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sell">
        <NativeTabs.Trigger.Label>판매</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'plus.square', selected: 'plus.square.fill' }} md="add_box" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>채팅</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
          md="chat"
        />
        {unread > 0 && (
          <NativeTabs.Trigger.Badge>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="my">
        <NativeTabs.Trigger.Label>마이</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
