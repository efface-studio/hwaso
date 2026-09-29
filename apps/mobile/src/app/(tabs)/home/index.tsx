import { useQuery } from '@tanstack/react-query';
import { router, Stack, useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { SEARCH_PLACEHOLDER, SearchContent, useSearch } from '@/components/search/search-content';
import { tabHeaderOptions } from '@/components/tab-header';
import { Chips } from '@/components/ui/chips';
import { ArtistRail } from '@/components/home/artist-rail';
import { BannerCarousel } from '@/components/home/banners';
import { Rail } from '@/components/home/rail';
import { Text } from '@/components/ui/text';
import { SkeletonHome, SkeletonScreen } from '@/components/ui/skeleton';
import { Empty, RefreshSkeleton } from '@/components/ui/state';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/**
 * 홈. 헤더의 돋보기(iOS 26 integratedButton)를 누르면 그 자리에서 검색창이 펼쳐지고,
 * 검색하는 동안 홈 대신 자동완성·결과를 보여준다 (다른 화면으로 넘어가지 않는다).
 */
export default function HomeScreen() {
  const t = useTheme();
  const signedIn = !!useAuthStore((s) => s.user);
  const focused = useIsFocused();
  const q = useQuery({ queryKey: ['home'], queryFn: api.market.home });
  const cats = useQuery({ queryKey: ['categories'], queryFn: api.market.categories, staleTime: 3_600_000 });
  const unreadQ = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: api.notifications.unreadCount,
    enabled: signedIn,
    refetchInterval: 60_000,
    // 다른 탭·화면을 보는 동안에는 주기 갱신을 멈춘다 (새 알림은 실시간 이벤트로도 온다)
    subscribed: focused,
  });
  const unread = unreadQ.data?.unreadCount ?? 0;
  const search = useSearch();
  const [searching, setSearching] = useState(false);
  const searchBar = useRef<SearchBarCommands>(null);
  const scroll = useRef<ScrollView>(null);
  // 로고를 눌러 새로고침할 때 (당겨서 새로고침과 같은 표시를 띄운다)
  const [logoRefreshing, setLogoRefreshing] = useState(false);
  const pull = usePullRefresh(() => Promise.all([q.refetch(), cats.refetch()]));
  const refreshing = pull.refreshing || logoRefreshing;
  const refreshFromLogo = async () => {
    if (searching || logoRefreshing) return;
    scroll.current?.scrollTo({ y: 0, animated: true });
    setLogoRefreshing(true);
    try {
      await Promise.all([
        q.refetch(),
        cats.refetch(),
        signedIn ? unreadQ.refetch() : null,
        // 스켈레톤이 한순간 깜빡이지 않게
        new Promise((r) => setTimeout(r, 600)),
      ]);
    } finally {
      setLogoRefreshing(false);
    }
  };

  const submit = (value: string) => {
    const v = search.submit(value);
    if (!v) return;
    searchBar.current?.setText(v);
    searchBar.current?.blur();
  };

  const header = (
    <Stack.Screen
      options={{
        unstable_headerLeftItems: tabHeaderOptions(null, { onLogoPress: () => void refreshFromLogo() })
          .unstable_headerLeftItems,
        headerSearchBarOptions: {
          ref: searchBar,
          placement: 'integratedButton',
          allowToolbarIntegration: false,
          hideWhenScrolling: false,
          placeholder: SEARCH_PLACEHOLDER,
          onFocus: () => setSearching(true),
          onChangeText: (e) => search.setText(e.nativeEvent.text),
          onSearchButtonPress: (e) => submit(e.nativeEvent.text),
          onCancelButtonPress: () => {
            setSearching(false);
            search.reset();
          },
        },
        unstable_headerRightItems: () => [
          {
            type: 'button',
            label: unread ? `알림 ${unread}개 안 읽음` : '알림',
            icon: { type: 'sfSymbol', name: 'bell' },
            onPress: () => router.push('/notifications'),
            ...(unread > 0 ? { badge: { value: unread > 99 ? '99+' : unread } } : {}),
          },
        ],
      }}
    />
  );

  if (searching)
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background }}>
        {header}
        <SearchContent s={search} onSubmit={submit} />
      </View>
    );
  if (q.isPending)
    return (
      <>
        {header}
        <SkeletonScreen>
          <SkeletonHome />
        </SkeletonScreen>
      </>
    );
  if (q.error || !q.data)
    return (
      <>
        {header}
        <Empty
          kind="error"
          title="홈을 불러오지 못했어요"
          description="네트워크를 확인하고 다시 시도해주세요."
          action={{ title: '다시 시도', onPress: () => void q.refetch() }}
        />
      </>
    );
  const h = q.data;
  return (
    <ScrollView
      ref={scroll}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={pull.onRefresh} />}
    >
      {header}
      <RefreshSkeleton refreshing={refreshing} variant="home">
        <BannerCarousel banners={h.banners} />
        {h.notices[0] && (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/notices/[id]', params: { id: h.notices[0]!.id } })}
            style={[styles.notice, { borderColor: t.colors.borderSoft }]}
          >
            <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>
              공지
            </Text>
            <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
              {h.notices[0].title}
            </Text>
            <Text color="faint">›</Text>
          </Pressable>
        )}
        {!!cats.data?.length && (
          <Chips
            label="카테고리"
            value=""
            onChange={(slug) => router.push({ pathname: '/category/[slug]', params: { slug } })}
            options={cats.data.map((c) => ({ value: c.slug, label: c.name }))}
          />
        )}
        <Rail title="지금 진행 중인 경매" items={h.liveAuctions} />
        <Rail title="곧 마감되는 경매" items={h.endingSoon} />
        <Rail title="곧 시작하는 경매" items={h.upcomingAuctions} />
        <Rail title="새로 들어온 작품" items={h.newArrivals} />
        <ArtistRail artists={h.popularArtists} />
        <Rail title="인기 작품" items={h.popular} />
        {h.collections.map((c) => (
          <Rail key={c.category.slug} title={c.category.name} items={c.items} />
        ))}
      </RefreshSkeleton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
