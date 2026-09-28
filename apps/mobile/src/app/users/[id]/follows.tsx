import { ApiError } from '@shop/api-client';
import type { FollowUserDto } from '@shop/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Kind = 'followers' | 'following';

function Row({ u, onToggle, busy }: { u: FollowUserDto; onToggle: () => void; busy: boolean }) {
  const t = useTheme();
  const me = useAuthStore((s) => s.user);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/users/[id]', params: { id: u.id } })}
      style={[styles.row, { borderColor: t.colors.borderSoft }]}
    >
      <Avatar avatarKey={u.avatarKey} name={u.nickname} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {u.nickname}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {u.bio || `판매 중 ${u.sellingCount}`}
        </Text>
      </View>
      {me && me.id !== u.id && (
        <Button
          title={u.isFollowing ? '팔로잉' : '팔로우'}
          size="sm"
          variant={u.isFollowing ? 'outline' : 'primary'}
          loading={busy}
          onPress={onToggle}
        />
      )}
    </Pressable>
  );
}

/** 팔로워 · 팔로잉 목록 (목록에서 바로 팔로우) */
export default function FollowsScreen() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>(params.type === 'following' ? 'following' : 'followers');
  const [busy, setBusy] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['follows', params.id, kind],
    queryFn: ({ pageParam }) =>
      (kind === 'followers' ? api.community.followers : api.community.following)(params.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const toggle = async (u: FollowUserDto) => {
    setBusy(u.id);
    try {
      await (u.isFollowing ? api.community.unfollow(u.id) : api.community.follow(u.id));
      void qc.invalidateQueries({ queryKey: ['follows', params.id] });
      void qc.invalidateQueries({ queryKey: ['user'] });
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '처리하지 못했어요.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: kind === 'followers' ? '팔로워' : '팔로잉' }} />
      <View style={{ paddingVertical: 8 }}>
        <Chips
          label="목록"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'followers', label: '팔로워' },
            { value: 'following', label: '팔로잉' },
          ]}
        />
      </View>
      {q.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data?.pages.flatMap((p) => p.items) ?? []}
          keyExtractor={(u) => u.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          ListEmptyComponent={
            <Empty title={kind === 'followers' ? '팔로워가 없어요' : '팔로우한 사람이 없어요'} />
          }
          renderItem={({ item }) => (
            <Row u={item} busy={busy === item.id} onToggle={() => void toggle(item)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
