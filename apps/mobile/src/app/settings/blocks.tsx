import { ApiError } from '@shop/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { currentLanguage, LOCALE } from '@/i18n';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 차단한 사용자: 차단한 사용자와는 채팅을 주고받을 수 없다 */
export default function BlocksScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['blocks'], queryFn: api.safety.blocks });
  const unblock = useMutation({
    mutationFn: (id: string) => api.safety.unblock(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['blocks'] });
      void qc.invalidateQueries({ queryKey: ['chat'] });
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : tr('blocks.unblockFailed')),
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
          <Stack.Screen options={{ title: tr('common:screen.blocks') }} />
          <Text variant="small" color="muted" style={{ marginBottom: 8 }}>
            {tr('blocks.notice')}
          </Text>
        </>
      }
      ListEmptyComponent={
        <Empty kind="people" title={tr('blocks.emptyTitle')} description={tr('blocks.emptyDescription')} />
      }
      renderItem={({ item: u }) => (
        <View style={[styles.row, { borderColor: t.colors.borderSoft }]}>
          <Avatar avatarKey={u.avatarKey} name={u.nickname} size={40} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1}>{u.nickname}</Text>
            <Text variant="caption" color="muted">
              {tr('blocks.blockedAt', {
                date: new Date(u.blockedAt).toLocaleDateString(LOCALE[currentLanguage()]),
              })}
            </Text>
          </View>
          <Button
            title={tr('blocks.unblock')}
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
