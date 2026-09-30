import { ApiError } from '@shop/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

const PLATFORM: Record<string, string> = { ios: 'iPhone·iPad', android: 'Android', web: '웹 브라우저' };
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했어요.');
const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 로그인 기기: 모르는 기기는 로그아웃시키고 비밀번호를 바꾸도록 안내한다 */
export default function DevicesScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sessions'], queryFn: api.auth.sessions });
  const pull = usePullRefresh(q.refetch);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['sessions'] });
  if (q.isPending) return <Loading variant="plain-list" />;
  const others = (q.data ?? []).filter((s) => !s.current).length;

  return (
    <List
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: 16 }}
      data={pull.refreshing ? [] : (q.data ?? [])}
      keyExtractor={(s) => s.id}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      ListEmptyComponent={pull.refreshing ? <Loading variant="plain-list" /> : null}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 8 }}>
          <Stack.Screen options={{ title: '로그인 기기' }} />
          <Text variant="small" color="muted">
            모르는 기기가 있다면 로그아웃시키고 비밀번호를 바꿔주세요.
          </Text>
          {others > 0 && (
            <Button
              title={`다른 기기 ${others}대 모두 로그아웃`}
              variant="outline"
              onPress={() =>
                Alert.alert('다른 기기에서 모두 로그아웃할까요?', undefined, [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '로그아웃',
                    style: 'destructive',
                    onPress: () =>
                      void api.auth.revokeOtherSessions().then(refresh, (e) => Alert.alert(errMsg(e))),
                  },
                ])
              }
            />
          )}
        </View>
      }
      renderItem={({ item: s }) => (
        <View style={[styles.row, { borderColor: t.colors.borderSoft }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">
              {s.deviceName}
              {s.current ? (
                <Text variant="small" color="primary">
                  {'  '}이 기기
                </Text>
              ) : null}
            </Text>
            <Text variant="caption" color="muted">
              {PLATFORM[s.platform] ?? s.platform} · {s.ipMasked} · 최근 사용 {when(s.lastUsedAt)}
            </Text>
          </View>
          {!s.current && (
            <Button
              title="로그아웃"
              size="sm"
              variant="ghost"
              onPress={() => void api.auth.revokeSession(s.id).then(refresh, (e) => Alert.alert(errMsg(e)))}
            />
          )}
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
