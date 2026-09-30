import { POLICIES, POLICY_SLUGS, type PolicySlug } from '@shop/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Empty } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { currentLanguage } from '@/i18n';
import { useTheme } from '@/theme';

const isSlug = (v: string | undefined): v is PolicySlug => POLICY_SLUGS.some((s) => s === v);

/** 약관·정책 (본문은 @shop/shared POLICIES — 웹 페이지와 같은 내용). 로그인 전(가입 화면)에도 연다 */
export default function PolicyScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const { slug } = useLocalSearchParams<{ slug: string }>();
  if (!isSlug(slug)) return <Empty kind="notfound" title={tr('policy.notFound')} />;
  const doc = POLICIES[slug];
  // 본문은 한국어 원문 그대로 — 제목·시행일 같은 화면 틀만 번역한다
  const title = tr(`policy.title.${slug}`);

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.body}
    >
      <Stack.Screen options={{ title }} />
      <View style={{ gap: 4 }}>
        <Text variant="h2">{title}</Text>
        <Text variant="small" color="muted">
          {tr('policy.effectiveDate', { date: doc.effectiveDate })}
        </Text>
        {currentLanguage() !== 'ko' && (
          <Text variant="small" color="muted">
            {tr('policy.koreanOnly')}
          </Text>
        )}
      </View>
      {doc.sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text variant="h3">{s.title}</Text>
          {s.body && <Text style={{ color: t.colors.foreground2 }}>{s.body}</Text>}
          {s.table && (
            <View style={[styles.table, { borderColor: t.colors.border, borderRadius: t.radius.md }]}>
              {/* 좁은 화면에서 3열 표는 읽기 어려워 행마다 카드처럼 항목: 값으로 풀어 쓴다 */}
              {s.table.rows.map((row, r) => (
                <View
                  key={row[0]}
                  style={[
                    styles.row,
                    r > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
                  ]}
                >
                  <Text variant="bodyStrong">{row[0]}</Text>
                  {row.slice(1).map((cell, i) => (
                    <View key={i} style={styles.cell}>
                      <Text variant="small" color="muted" style={styles.cellLabel}>
                        {s.table!.columns[i + 1]}
                      </Text>
                      <Text variant="small" style={{ flex: 1 }}>
                        {cell}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 48, gap: 28 },
  section: { gap: 8 },
  table: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { padding: 14, gap: 6 },
  cell: { flexDirection: 'row', gap: 12 },
  cellLabel: { width: 64 },
});
