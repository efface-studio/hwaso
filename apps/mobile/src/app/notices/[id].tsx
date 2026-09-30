import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/i18n/format';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 공지 상세 (본문은 줄바꿈만 있는 순수 텍스트) */
export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { t: tr } = useTranslation(['home', 'common']);
  const q = useQuery({ queryKey: ['notice', id], queryFn: () => api.notices.get(id) });
  if (q.isPending) return <Loading variant="text" />;
  const n = q.data;
  if (!n) return <Empty kind="notfound" title={tr('notices.notFound')} />;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: tr('common:screen.notices') }} />
      <Text variant="h2" accessibilityRole="header">
        {n.title}
      </Text>
      <Text variant="caption" color="muted">
        {formatDate(n.publishedAt)}
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
