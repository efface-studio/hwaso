import { ApiError } from '@shop/api-client';
import type { FollowUserDto } from '@shop/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Kind = 'followers' | 'following';

function Row({ u, onToggle, busy }: { u: FollowUserDto; onToggle: () => void; busy: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
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
          {u.bio || tr('follows.selling', { count: u.sellingCount })}
        </Text>
      </View>
      {me && me.id !== u.id && (
        <Button
          title={
            u.isFollowing
              ? tr('people.following')
              : u.followsMe
                ? tr('people.followBack')
                : tr('people.follow')
          }
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
  const { t: tr } = useTranslation(['my', 'common']);
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
  const pull = usePullRefresh(q.refetch);
  const toggle = async (u: FollowUserDto) => {
    setBusy(u.id);
    try {
      await (u.isFollowing ? api.community.unfollow(u.id) : api.community.follow(u.id));
      void qc.invalidateQueries({ queryKey: ['follows', params.id] });
      void qc.invalidateQueries({ queryKey: ['user'] });
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : tr('common:state.actionFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen
        options={{ title: kind === 'followers' ? tr('people.followers') : tr('people.following') }}
      />
      <View style={{ paddingVertical: 8 }}>
        <Chips
          label={tr('follows.list')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'followers', label: tr('people.followers') },
            { value: 'following', label: tr('people.following') },
          ]}
        />
      </View>
      {q.isPending ? (
        <Loading variant="list" />
      ) : (
        <List
          contentContainerStyle={{ flexGrow: 1 }}
          data={pull.refreshing ? [] : (q.data?.pages.flatMap((p) => p.items) ?? [])}
          keyExtractor={(u) => u.id}
          refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          ListEmptyComponent={
            pull.refreshing ? (
              <Loading variant="list" />
            ) : (
              <Empty
                kind="people"
                title={kind === 'followers' ? tr('follows.emptyFollowers') : tr('follows.emptyFollowing')}
              />
            )
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
