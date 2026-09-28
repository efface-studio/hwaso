import { ApiError } from '@shop/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { ProductCard } from '@/components/product/product-card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { useGrid } from '@/hooks/use-grid';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Tab = 'selling' | 'sold';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const g = useGrid();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('selling');
  const [busy, setBusy] = useState(false);
  const profile = useQuery({ queryKey: ['user', id], queryFn: () => api.market.user(id) });
  const items = useQuery({
    queryKey: ['user-products', id, tab],
    queryFn: () => api.market.userProducts(id, tab),
  });
  if (profile.isPending) return <Loading />;
  const u = profile.data;
  if (!u) return <Empty title="사용자를 찾을 수 없어요" />;

  const toggleFollow = async () => {
    if (!me) return router.push('/login');
    setBusy(true);
    try {
      await (u.isFollowing ? api.community.unfollow(u.id) : api.community.follow(u.id));
      await qc.invalidateQueries({ queryKey: ['user', id] });
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '처리하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

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
      ListHeaderComponent={
        <View>
          <Stack.Screen options={{ title: u.nickname }} />
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
            <Stat label="평점" value={`${u.ratingAvg.toFixed(1)} (${u.ratingCount})`} />
            <Stat label="팔로워" value={u.followerCount} />
            <Stat label="팔로잉" value={u.followingCount} />
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
            label="작품"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'selling', label: `판매 중 ${u.sellingCount}` },
              { value: 'sold', label: `판매 완료 ${u.soldCount}` },
            ]}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  pad: { paddingHorizontal: 16, paddingBottom: 12 },
  stats: { flexDirection: 'row', gap: 24 },
});
