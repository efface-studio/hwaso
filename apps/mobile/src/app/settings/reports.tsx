import { REPORT_REASON_LABEL, REPORT_STATUS_LABEL, REPORT_TARGET_LABEL } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 신고 내역: 운영팀 처리 상태와 결과 */
export default function ReportsScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['my-reports'], queryFn: api.safety.myReports });
  const pull = usePullRefresh(q.refetch);
  if (q.isPending) return <Loading variant="plain-list" />;
  return (
    <FlatList
      alwaysBounceVertical={false}
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ flexGrow: 1, padding: 16 }}
      data={pull.refreshing ? [] : (q.data ?? [])}
      keyExtractor={(r) => r.id}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      ListHeaderComponent={<Stack.Screen options={{ title: '신고 내역' }} />}
      ListEmptyComponent={
        pull.refreshing ? <Loading variant="plain-list" /> : <Empty kind="doc" title="신고 내역이 없어요" />
      }
      renderItem={({ item: r }) => (
        <View style={[styles.row, { borderColor: t.colors.borderSoft }]}>
          <Text variant="label" color={r.status === 'RESOLVED' ? 'muted' : 'primary'}>
            {REPORT_STATUS_LABEL[r.status]} · {REPORT_TARGET_LABEL[r.targetType]} ·{' '}
            {REPORT_REASON_LABEL[r.reason]}
          </Text>
          {r.detail ? <Text variant="small">{r.detail}</Text> : null}
          {r.resolution ? (
            <Text variant="small" color="muted">
              처리 결과: {r.resolution}
            </Text>
          ) : null}
          <Text variant="caption" color="muted">
            {new Date(r.createdAt).toLocaleDateString('ko-KR')} 접수
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
