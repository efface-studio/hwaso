import { ApiError } from '@shop/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import i18n, { currentLanguage, LOCALE } from '@/i18n';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('common:state.actionFailed'));
const when = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE[currentLanguage()], {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 로그인 기기: 모르는 기기는 로그아웃시키고 비밀번호를 바꾸도록 안내한다 */
export default function DevicesScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sessions'], queryFn: api.auth.sessions });
  const pull = usePullRefresh(q.refetch);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['sessions'] });
  if (q.isPending) return <Loading variant="plain-list" />;
  const others = (q.data ?? []).filter((s) => !s.current).length;
  const platform: Record<string, string> = {
    ios: tr('devices.platform.ios'),
    android: tr('devices.platform.android'),
    web: tr('devices.platform.web'),
  };

  return (
    <List
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: 16 }}
      data={q.data ?? []}
      keyExtractor={(s) => s.id}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 8 }}>
          <Stack.Screen options={{ title: tr('common:screen.devices') }} />
          <Text variant="small" color="muted">
            {tr('devices.notice')}
          </Text>
          {others > 0 && (
            <Button
              title={tr('devices.logoutOthers', { count: others })}
              variant="outline"
              onPress={() =>
                Alert.alert(tr('devices.logoutOthersConfirm'), undefined, [
                  { text: tr('common:action.cancel'), style: 'cancel' },
                  {
                    text: tr('devices.logout'),
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
                  {'  '}
                  {tr('devices.thisDevice')}
                </Text>
              ) : null}
            </Text>
            <Text variant="caption" color="muted">
              {platform[s.platform] ?? s.platform} · {s.ipMasked} ·{' '}
              {tr('devices.lastUsed', { date: when(s.lastUsedAt) })}
            </Text>
          </View>
          {!s.current && (
            <Button
              title={tr('devices.logout')}
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
