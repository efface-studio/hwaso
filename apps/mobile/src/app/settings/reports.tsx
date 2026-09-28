import { REPORT_REASON_LABEL, REPORT_STATUS_LABEL, REPORT_TARGET_LABEL } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 신고 내역: 운영팀 처리 상태와 결과 */
export default function ReportsScreen() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['my-reports'], queryFn: api.safety.myReports });
  if (q.isPending) return <Loading />;
  return (
    <FlatList
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: 16 }}
      data={q.data ?? []}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      ListHeaderComponent={<Stack.Screen options={{ title: '신고 내역' }} />}
      ListEmptyComponent={<Empty title="신고 내역이 없어요" />}
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
