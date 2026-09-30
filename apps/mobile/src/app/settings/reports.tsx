import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { currentLanguage, LOCALE } from '@/i18n';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 신고 내역: 운영팀 처리 상태와 결과 */
export default function ReportsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const q = useQuery({ queryKey: ['my-reports'], queryFn: api.safety.myReports });
  const pull = usePullRefresh(q.refetch);
  if (q.isPending) return <Loading variant="plain-list" />;
  return (
    <List
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: 16 }}
      data={pull.refreshing ? [] : (q.data ?? [])}
      keyExtractor={(r) => r.id}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      ListHeaderComponent={<Stack.Screen options={{ title: tr('common:screen.reports') }} />}
      ListEmptyComponent={
        pull.refreshing ? <Loading variant="plain-list" /> : <Empty kind="doc" title={tr('reports.empty')} />
      }
      renderItem={({ item: r }) => (
        <View style={[styles.row, { borderColor: t.colors.borderSoft }]}>
          <Text variant="label" color={r.status === 'RESOLVED' ? 'muted' : 'primary'}>
            {label('reportStatus', r.status)} · {label('reportTarget', r.targetType)} ·{' '}
            {label('reportReason', r.reason)}
          </Text>
          {r.detail ? <Text variant="small">{r.detail}</Text> : null}
          {r.resolution ? (
            <Text variant="small" color="muted">
              {tr('reports.resolution', { text: r.resolution })}
            </Text>
          ) : null}
          <Text variant="caption" color="muted">
            {tr('reports.receivedAt', {
              date: new Date(r.createdAt).toLocaleDateString(LOCALE[currentLanguage()]),
            })}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
