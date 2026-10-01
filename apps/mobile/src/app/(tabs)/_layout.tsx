import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyTabIcon } from '@/components/tab-avatar-icon';
import { ADMIN_TAB_ICONS, preloadTabIcons, useTabIcons } from '@/components/tab-icons';
import { isAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { TAB_BAR_SCALE, useTheme } from '@/theme';

/**
 * 하단 탭 — 네이티브 탭 바 (iOS 26 에서는 시스템 Liquid Glass, Android 는 Material 3).
 * 웹과 같은 순서: 홈 · 경매 · 판매 · 채팅 · 마이
 * iOS 26 에서 마이는 search 역할로 두어 오른쪽에 분리된 원형 버튼으로 보이고, 프로필 사진 + "마이" 글자를 아이콘으로 쓴다
 * (분리된 탭은 시스템이 글자를 그리지 않는다). 관리자 계정은 마이 탭을 두 번 누르면 관리자 앱으로 넘어간다.
 * iOS 아이콘은 SF Symbol 보다 작은 선형 아이콘 이미지 — 첫 프레임은 SF Symbol 로 그리고 모든 탭을 한 번에 바꾼다.
 */
/** 두 번 누름으로 보는 간격 */
const DOUBLE_TAP_MS = 350;
/** 이보다 빨리 다시 오는 tabPress 는 같은 탭의 중복 이벤트다 (iOS 27 은 한 번 탭에 두 번 보낸다) — 사람의 더블 탭은 더 느리다 */
const DUPLICATE_EVENT_MS = 80;

export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const signedIn = !!user;
  const my = useMyTabIcon({
    avatarKey: user?.profile.avatarKey ?? null,
    name: user?.profile.nickname ?? '',
    label: tr('tabs.my'),
  });
  const icons = useTabIcons();
  // 관리자 계정은 마이 탭을 빠르게 두 번 누르면 관리자 앱으로 (이미 마이 탭이어도 누를 때마다 tabPress 가 온다)
  const admin = isAdmin(user);
  // 관리자 계정이면 관리자 탭 아이콘도 미리 만들어 둔다 (일반 계정은 앱 시작 때 만들지 않는다)
  useEffect(() => {
    if (admin) preloadTabIcons(ADMIN_TAB_ICONS);
  }, [admin]);
  const lastMyPress = useRef(0);
  const onMyPress = () => {
    if (!admin) return;
    const now = Date.now();
    const gap = now - lastMyPress.current;
    if (gap < DUPLICATE_EVENT_MS) return;
    if (gap < DOUBLE_TAP_MS) {
      lastMyPress.current = 0;
      router.push('/admin/dashboard');
      return;
    }
    lastMyPress.current = now;
  };
  // 새 메시지는 실시간 이벤트(realtime-sync)가 갱신한다 — 주기 갱신은 놓친 이벤트를 채우는 보조라 5분마다
  const chat = useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: api.chat.unreadCount,
    enabled: signedIn,
    refetchInterval: 5 * 60_000,
  });
  const unread = chat.data?.unreadCount ?? 0;
  return (
    <>
      {my.capture}
      <NativeTabs
        tintColor={t.colors.primary}
        labelStyle={{ fontSize: (t.senior ? 13 : 11) * TAB_BAR_SCALE }}
      >
        <NativeTabs.Trigger name="home">
          <NativeTabs.Trigger.Label>{tr('tabs.home')}</NativeTabs.Trigger.Label>
          {icons.home ? (
            <NativeTabs.Trigger.Icon src={icons.home} renderingMode="template" md="home" />
          ) : (
            <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
          )}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="auctions">
          <NativeTabs.Trigger.Label>{tr('tabs.auctions')}</NativeTabs.Trigger.Label>
          {icons.auctions ? (
            <NativeTabs.Trigger.Icon src={icons.auctions} renderingMode="template" md="gavel" />
          ) : (
            <NativeTabs.Trigger.Icon sf={{ default: 'hammer', selected: 'hammer.fill' }} md="gavel" />
          )}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="sell">
          <NativeTabs.Trigger.Label>{tr('tabs.sell')}</NativeTabs.Trigger.Label>
          {icons.sell ? (
            <NativeTabs.Trigger.Icon src={icons.sell} renderingMode="template" md="add_box" />
          ) : (
            <NativeTabs.Trigger.Icon
              sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }}
              md="add_box"
            />
          )}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="chat">
          <NativeTabs.Trigger.Label>{tr('tabs.chat')}</NativeTabs.Trigger.Label>
          {icons.chat ? (
            <NativeTabs.Trigger.Icon src={icons.chat} renderingMode="template" md="chat" />
          ) : (
            <NativeTabs.Trigger.Icon
              sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }}
              md="chat"
            />
          )}
          {unread > 0 && (
            <NativeTabs.Trigger.Badge>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="my" role="search" listeners={{ tabPress: onMyPress }}>
          <NativeTabs.Trigger.Label>{tr('tabs.my')}</NativeTabs.Trigger.Label>
          {my.icon ? (
            <NativeTabs.Trigger.Icon src={my.icon} renderingMode="original" md="person" />
          ) : icons.my ? (
            <NativeTabs.Trigger.Icon src={icons.my} renderingMode="template" md="person" />
          ) : (
            <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
          )}
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
