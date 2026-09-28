import { Link, router, type Href } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { logout } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { usePrefs, type ThemePreference } from '@/stores/prefs';
import { useTheme } from '@/theme';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description && (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

export default function MyScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const { theme, senior, setTheme, setSenior } = usePrefs();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
    >
      {user ? (
        <View style={styles.profile}>
          <Text variant="h2">{user.profile.nickname}</Text>
          <Text variant="small" color="muted">
            {user.email.endsWith('.invalid') ? '소셜 계정' : user.email}
          </Text>
        </View>
      ) : (
        <View style={styles.profile}>
          <Text variant="h3">로그인하고 입찰·구매·채팅을 시작하세요</Text>
          <Button title="로그인" onPress={() => router.push('/login')} block style={{ marginTop: 12 }} />
        </View>
      )}
      {user && (
        <>
          <Text variant="label" color="muted" style={styles.group}>
            쇼핑
          </Text>
          {(
            [
              ['/my/favorites', '관심 작품'],
              ['/my/recent', '최근 본 작품'],
            ] as [Href, string][]
          ).map(([href, label]) => (
            <Link key={label} href={href} asChild>
              <Pressable accessibilityRole="link">
                <Row label={label}>
                  <Text color="faint">›</Text>
                </Row>
              </Pressable>
            </Link>
          ))}
        </>
      )}
      <Text variant="label" color="muted" style={styles.group}>
        화면
      </Text>
      <Row label="테마">
        <View style={styles.segment} accessibilityRole="radiogroup">
          {THEMES.map((o) => (
            <Button
              key={o.value}
              title={o.label}
              size="sm"
              variant={theme === o.value ? 'secondary' : 'ghost'}
              onPress={() => setTheme(o.value)}
              accessibilityState={{ selected: theme === o.value }}
            />
          ))}
        </View>
      </Row>
      <Row
        label="큰 글씨 모드 (시니어 모드)"
        description="글자와 버튼을 크게, 글자색을 진하게 하고 움직임을 줄여요."
      >
        <Switch
          value={senior}
          onValueChange={setSenior}
          trackColor={{ true: t.colors.primary }}
          accessibilityLabel="큰 글씨 모드"
        />
      </Row>
      {user && (
        <Button
          title="로그아웃"
          variant="ghost"
          style={{ marginTop: 24 }}
          onPress={() =>
            Alert.alert('로그아웃할까요?', undefined, [
              { text: '취소', style: 'cancel' },
              { text: '로그아웃', style: 'destructive', onPress: () => void logout() },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  profile: { paddingVertical: 8, gap: 2 },
  group: { marginTop: 28, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  segment: { flexDirection: 'row', gap: 4 },
});
