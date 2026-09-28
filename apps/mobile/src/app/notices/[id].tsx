import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 공지 상세 (본문은 줄바꿈만 있는 순수 텍스트) */
export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const q = useQuery({ queryKey: ['notice', id], queryFn: () => api.notices.get(id) });
  if (q.isPending) return <Loading />;
  const n = q.data;
  if (!n) return <Empty title="공지를 찾을 수 없어요" />;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: '공지사항' }} />
      <Text variant="h2" accessibilityRole="header">
        {n.title}
      </Text>
      <Text variant="caption" color="muted">
        {new Date(n.publishedAt).toLocaleDateString('ko-KR')}
      </Text>
      <Text selectable style={{ marginTop: 12 }}>
        {n.body}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 4, paddingBottom: 48 },
});
