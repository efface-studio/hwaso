import { ApiError } from '@shop/api-client';
import type { PublicProfileDto } from '@shop/shared';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ReviewItem, ReviewSummary } from '@/components/community/review-item';
import { ProductCard } from '@/components/product/product-card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { useGrid } from '@/hooks/use-grid';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Tab = 'selling' | 'sold' | 'reviews';
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했어요.');

function Stat({ label, value, onPress }: { label: string; value: string | number; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'link' : undefined}
      disabled={!onPress}
      onPress={onPress}
      hitSlop={6}
    >
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </Pressable>
  );
}

function Header({ u, tab, setTab }: { u: PublicProfileDto; tab: Tab; setTab: (t: Tab) => void }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const follows = (type: 'followers' | 'following') =>
    router.push({ pathname: '/users/[id]/follows', params: { id: u.id, type } });

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
          headerRight:
            me?.id === u.id
              ? undefined
              : () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="더보기"
                    hitSlop={10}
                    onPress={menu}
                  >
                    <Text variant="h3">⋯</Text>
                  </Pressable>
                ),
        }}
      />
      <View style={styles.head}>
        <Avatar avatarKey={u.avatarKey} name={u.nickname} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h2">{u.nickname}</Text>
          <Text variant="small" color="muted">
            {[u.verified ? '인증 판매자' : null, u.region, `${new Date(u.joinedAt).getFullYear()}년 가입`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
      {u.bio ? <Text style={styles.pad}>{u.bio}</Text> : null}
      <View style={[styles.stats, styles.pad]}>
        <Stat label="거래" value={u.tradeCount} />
        <Stat
          label="평점"
          value={`${u.ratingAvg.toFixed(1)} (${u.ratingCount})`}
          onPress={() => setTab('reviews')}
        />
        <Stat label="팔로워" value={u.followerCount} onPress={() => follows('followers')} />
        <Stat label="팔로잉" value={u.followingCount} onPress={() => follows('following')} />
      </View>
      {me?.id !== u.id && (
        <View style={styles.pad}>
          <Button
            title={u.isFollowing ? '팔로잉' : '팔로우'}
            variant={u.isFollowing ? 'outline' : 'primary'}
            block
            loading={busy}
            onPress={() => void toggleFollow()}
          />
        </View>
      )}
      <Chips
        label="보기"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'selling', label: `판매 중 ${u.sellingCount}` },
          { value: 'sold', label: `판매 완료 ${u.soldCount}` },
          { value: 'reviews', label: `후기 ${u.ratingCount}` },
        ]}
      />
    </View>
  );
}

/** 사용자 프로필: 판매 중·판매 완료 작품, 거래 후기, 팔로워·팔로잉, 신고·차단 */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const g = useGrid();
  const [tab, setTab] = useState<Tab>('selling');
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
  if (profile.isPending) return <Loading />;
  const u = profile.data;
  if (!u) return <Empty title="사용자를 찾을 수 없어요" />;
  const header = <Header u={u} tab={tab} setTab={setTab} />;

  if (tab === 'reviews')
    return (
      <FlatList
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
        ListEmptyComponent={reviews.isPending ? <Loading /> : <Empty title="아직 거래 후기가 없어요" />}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    );

  return (
    <FlatList
      key={g.columns}
      style={{ backgroundColor: t.colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      data={items.data ?? []}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ gap: 20, paddingBottom: 32 }}
      ListEmptyComponent={
        items.isPending ? (
          <Loading />
        ) : (
          <Empty title={tab === 'selling' ? '판매 중인 작품이 없어요' : '판매 완료된 작품이 없어요'} />
        )
      }
      ListHeaderComponent={header}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  pad: { paddingHorizontal: 16, paddingBottom: 12 },
  stats: { flexDirection: 'row', gap: 24 },
});
