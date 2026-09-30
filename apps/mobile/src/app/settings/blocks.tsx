import { ApiError } from '@shop/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 차단한 사용자: 차단한 사용자와는 채팅을 주고받을 수 없다 */
export default function BlocksScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['blocks'], queryFn: api.safety.blocks });
  const unblock = useMutation({
    mutationFn: (id: string) => api.safety.unblock(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['blocks'] });
      void qc.invalidateQueries({ queryKey: ['chat'] });
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : '해제하지 못했어요.'),
  });
  if (q.isPending) return <Loading variant="list" />;

  return (
    <List
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: 16 }}
      data={q.data ?? []}
      keyExtractor={(u) => u.id}
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: '차단한 사용자' }} />
          <Text variant="small" color="muted" style={{ marginBottom: 8 }}>
            차단한 사용자와는 채팅을 주고받을 수 없어요.
          </Text>
        </>
      }
      ListEmptyComponent={
        <Empty
          kind="people"
          title="차단한 사용자가 없어요"
          description="채팅방 메뉴에서 사용자를 차단할 수 있어요."
        />
      }
      renderItem={({ item: u }) => (
        <View style={[styles.row, { borderColor: t.colors.borderSoft }]}>
          <Avatar avatarKey={u.avatarKey} name={u.nickname} size={40} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1}>{u.nickname}</Text>
            <Text variant="caption" color="muted">
              {new Date(u.blockedAt).toLocaleDateString('ko-KR')} 차단
            </Text>
          </View>
          <Button
            title="차단 해제"
            size="sm"
            variant="outline"
            loading={unblock.isPending && unblock.variables === u.id}
            onPress={() => unblock.mutate(u.id)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
