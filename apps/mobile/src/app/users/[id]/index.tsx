import { ApiError } from '@shop/api-client';
import type { PublicProfileDto } from '@shop/shared';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ReviewItem, ReviewSummary } from '@/components/community/review-item';
import { ProductCard } from '@/components/product/product-card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useGrid } from '@/hooks/use-grid';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Tab = 'selling' | 'sold' | 'reviews';
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했어요.');

function Stat({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label} ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.stat, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="h3">{value}</Text>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="small" color="muted">
        {label}
      </Text>
      <Text variant="small" style={{ fontWeight: '600' }}>
        {value}
      </Text>
    </View>
  );
}

const TABS: Tab[] = ['selling', 'sold', 'reviews'];

/**
 * 판매 중 · 판매 완료 · 후기 (전체 폭 밑줄 탭). 밑줄이 고른 탭으로 미끄러져 간다.
 * 후기 탭은 다른 목록이라 탭 바가 새로 붙으므로, 직전 탭(from) 자리에서 출발한다.
 */
function Tabs({
  u,
  tab,
  from,
  setTab,
}: {
  u: PublicProfileDto;
  tab: Tab;
  from: Tab;
  setTab: (t: Tab) => void;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue<number | null>(null);
  const seg = width / TABS.length;

  useEffect(() => {
    if (!seg) return;
    if (x.value === null) x.value = TABS.indexOf(from) * seg;
    x.value = withTiming(TABS.indexOf(tab) * seg, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [tab, from, seg, x]);

  const indicator = useAnimatedStyle(() => ({
    opacity: x.value === null ? 0 : 1,
    transform: [{ translateX: x.value ?? 0 }],
  }));

  const counts: Record<Tab, [string, number]> = {
    selling: ['판매 중', u.sellingCount],
    sold: ['판매 완료', u.soldCount],
    reviews: ['후기', u.ratingCount],
  };
  return (
    <View
      style={[styles.tabs, { borderColor: t.colors.border }]}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {TABS.map((value) => {
        const on = tab === value;
        const [label, count] = counts[value];
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => setTab(value)}
            style={styles.tab}
          >
            <Text variant={on ? 'bodyStrong' : 'body'} color={on ? 'foreground' : 'muted'}>
              {label}{' '}
              <Text variant="small" color={on ? 'primary' : 'faint'}>
                {count}
              </Text>
            </Text>
          </Pressable>
        );
      })}
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, { width: seg, backgroundColor: t.colors.foreground }, indicator]}
      />
    </View>
  );
}

function Header({
  u,
  tab,
  from,
  setTab,
}: {
  u: PublicProfileDto;
  tab: Tab;
  from: Tab;
  setTab: (t: Tab) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const mine = me?.id === u.id;
  const [busy, setBusy] = useState(false);
  const follows = (type: 'followers' | 'following') =>
    router.push({ pathname: '/users/[id]/follows', params: { id: u.id, type } });
  const joined = new Date(u.joinedAt);
  const joinedLabel = `${joined.getFullYear()}년 ${joined.getMonth() + 1}월`;

  const toggleFollow = async () => {
    if (!me) return router.push('/login');
    setBusy(true);
    try {
      await (u.isFollowing ? api.community.unfollow(u.id) : api.community.follow(u.id));
      await qc.invalidateQueries({ queryKey: ['user', u.id] });
    } catch (e) {
      Alert.alert(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const share = () =>
    void Share.share({ message: `${u.nickname} · 화소`, url: `${env.webUrl}/users/${u.id}` });
  const menu = () =>
    actionSheet(u.nickname, [
      {
        label: '신고하기',
        destructive: true,
        onPress: () =>
          me
            ? router.push({ pathname: '/report', params: { type: 'USER', id: u.id } })
            : router.push('/login'),
      },
      {
        label: '차단하기',
        destructive: true,
        onPress: () => {
          if (!me) return router.push('/login');
          Alert.alert(`${u.nickname}님을 차단할까요?`, '서로 채팅을 주고받을 수 없게 돼요.', [
            { text: '취소', style: 'cancel' },
            {
              text: '차단',
              style: 'destructive',
              onPress: () =>
                void api.safety.block(u.id).then(
                  () => Alert.alert('차단했어요', '설정 › 차단한 사용자에서 해제할 수 있어요.'),
                  (e: unknown) => Alert.alert(errMsg(e)),
                ),
            },
          ]);
        },
      },
    ]);

  return (
    <View>
      <Stack.Screen
        options={{
          title: u.nickname,
          unstable_headerRightItems: mine
            ? undefined
            : () => [
                {
                  type: 'button',
                  label: '더보기',
                  icon: { type: 'sfSymbol', name: 'ellipsis' },
                  onPress: menu,
                },
              ],
        }}
      />

      <View style={styles.hero}>
        <View>
          <Avatar avatarKey={u.avatarKey} name={u.nickname} size={96} />
          {u.verified && (
            <View
              style={[
                styles.verified,
                { backgroundColor: t.colors.primary, borderColor: t.colors.background },
              ]}
              accessibilityLabel="인증 판매자"
            >
              <Icon ios="checkmark" android="check" color="primaryForeground" size={13} />
            </View>
          )}
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="h1" style={styles.name}>
            {u.nickname}
          </Text>
          <Text variant="small" color="muted">
            {[u.verified ? '인증 판매자' : null, u.region, `${joinedLabel} 가입`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {u.bio ? (
          <Text style={styles.bio} numberOfLines={4}>
            {u.bio}
          </Text>
        ) : mine ? (
          <Pressable onPress={() => router.push('/settings/profile')} accessibilityRole="button">
            <Text variant="small" color="primary">
              + 소개를 적어 판매자 프로필을 채워보세요
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.stats, { borderColor: t.colors.borderSoft }]}>
        <Stat label="거래" value={String(u.tradeCount)} />
        <Stat
          label={`후기 ${u.ratingCount}`}
          value={u.ratingCount ? `★ ${u.ratingAvg.toFixed(1)}` : '–'}
          onPress={() => setTab('reviews')}
        />
        <Stat label="팔로워" value={String(u.followerCount)} onPress={() => follows('followers')} />
        <Stat label="팔로잉" value={String(u.followingCount)} onPress={() => follows('following')} />
      </View>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          {mine ? (
            <Button
              title="프로필 수정"
              variant="outline"
              block
              onPress={() => router.push('/settings/profile')}
            />
          ) : (
            <Button
              title={u.isFollowing ? '팔로잉' : '팔로우'}
              variant={u.isFollowing ? 'outline' : 'primary'}
              block
              loading={busy}
              onPress={() => void toggleFollow()}
            />
          )}
        </View>
        <Button
          title="공유"
          variant="outline"
          icon={<Icon ios="square.and.arrow.up" android="share" size={16} />}
          onPress={share}
        />
      </View>

      {u.isSeller && (
        <View style={[styles.info, { backgroundColor: t.colors.surface2, borderRadius: t.radius.md }]}>
          <Text variant="label">판매자 정보</Text>
          <InfoRow label="판매자 인증" value={u.verified ? '완료' : '미인증'} />
          <InfoRow label="판매 중 · 판매 완료" value={`${u.sellingCount} · ${u.soldCount}`} />
          <InfoRow label="거래 횟수" value={`${u.tradeCount}회`} />
          <InfoRow label="가입" value={joinedLabel} />
        </View>
      )}

      <Tabs u={u} tab={tab} from={from} setTab={setTab} />
    </View>
  );
}

/** 사용자 프로필: 판매 중·판매 완료 작품, 거래 후기, 팔로워·팔로잉, 신고·차단 */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const g = useGrid();
  const [tab, setTabState] = useState<Tab>('selling');
  // 탭 밑줄이 직전 탭에서 출발하도록 기억한다
  const prevTab = useRef<Tab>('selling');
  const setTab = (next: Tab) => {
    prevTab.current = tab;
    setTabState(next);
  };
  const profile = useQuery({ queryKey: ['user', id], queryFn: () => api.market.user(id) });
  const items = useQuery({
    queryKey: ['user-products', id, tab],
    queryFn: () => api.market.userProducts(id, tab as 'selling' | 'sold'),
    enabled: tab !== 'reviews',
  });
  const summary = useQuery({
    queryKey: ['review-summary', id],
    queryFn: () => api.community.reviewSummary(id),
    enabled: tab === 'reviews',
  });
  const reviews = useInfiniteQuery({
    queryKey: ['reviews', id],
    queryFn: ({ pageParam }) => api.community.reviews(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: tab === 'reviews',
  });
  if (profile.isPending) return <Loading variant="text" />;
  const u = profile.data;
  if (!u) return <Empty kind="notfound" title="사용자를 찾을 수 없어요" />;
  const header = <Header u={u} tab={tab} from={prevTab.current} setTab={setTab} />;

  if (tab === 'reviews')
    return (
      <FlatList
        alwaysBounceVertical={false}
        style={{ backgroundColor: t.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={reviews.data?.pages.flatMap((p) => p.items) ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <ReviewItem r={item} />}
        onEndReached={() =>
          reviews.hasNextPage && !reviews.isFetchingNextPage && void reviews.fetchNextPage()
        }
        ListHeaderComponent={
          <>
            {header}
            {summary.data && summary.data.ratingCount > 0 && <ReviewSummary s={summary.data} />}
          </>
        }
        ListEmptyComponent={
          reviews.isPending ? (
            <Loading variant="list" />
          ) : (
            <Empty kind="doc" title="아직 거래 후기가 없어요" />
          )
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
      />
    );

  return (
    <FlatList
      alwaysBounceVertical={false}
      key={g.columns}
      style={{ backgroundColor: t.colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      data={items.data ?? []}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ flexGrow: 1, gap: 20, paddingBottom: 32 }}
      ListEmptyComponent={
        items.isPending ? (
          <Loading variant="grid" />
        ) : (
          <Empty title={tab === 'selling' ? '판매 중인 작품이 없어요' : '판매 완료된 작품이 없어요'} />
        )
      }
      ListHeaderComponent={header}
    />
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },
  name: { fontSize: 26, lineHeight: 32 },
  bio: { textAlign: 'center' },
  verified: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  info: { marginHorizontal: 16, marginTop: 16, padding: 16, gap: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tabs: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  indicator: { position: 'absolute', left: 0, bottom: -StyleSheet.hairlineWidth, height: 2 },
});
