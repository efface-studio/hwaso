import * as LocalAuthentication from 'expo-local-authentication';
import { router, Stack, type Href } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { useTheme } from '@/theme';

const GROUPS: { title: string; rows: [Href, string][] }[] = [
  {
    title: '계정',
    rows: [
      ['/settings/profile', '프로필'],
      ['/settings/identity', '본인인증 (PASS)'],
      ['/addresses', '배송지 관리'],
    ],
  },
  {
    title: '로그인 · 보안',
    rows: [
      ['/settings/password', '비밀번호'],
      ['/settings/social', '연결된 소셜 계정'],
      ['/settings/devices', '로그인 기기'],
    ],
  },
  {
    title: '알림 · 안전',
    rows: [
      ['/settings/notifications', '알림 설정'],
      ['/settings/blocks', '차단한 사용자'],
      ['/settings/reports', '신고 내역'],
    ],
  },
];

/** 설정: 계정·보안·알림·안전 메뉴와 앱 잠금 */
export default function SettingsScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const { appLock, setAppLock } = usePrefs();
  if (!user) return null;

  const toggleLock = async (on: boolean) => {
    if (!on) return setAppLock(false);
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled)
      return Alert.alert(
        '생체 인증을 사용할 수 없어요',
        '기기 설정에서 Face ID·지문 또는 화면 잠금을 먼저 등록해주세요.',
      );
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: '앱 잠금 켜기' });
    if (r.success) setAppLock(true);
  };

  const row = (label: string, onPress: () => void, color?: 'destructive') => (
    <Pressable
      key={label}
      accessibilityRole="link"
      onPress={onPress}
      style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}
    >
      <Text style={{ flex: 1 }} color={color}>
        {label}
      </Text>
      <Text color="faint">›</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: '설정' }} />
      {GROUPS.map((g) => (
        <View key={g.title}>
          <Text variant="label" color="muted" style={styles.group}>
            {g.title}
          </Text>
          {g.rows.map(([href, label]) => row(label, () => router.push(href)))}
        </View>
      ))}
      {Platform.OS !== 'web' && (
        <View>
          <Text variant="label" color="muted" style={styles.group}>
            앱
          </Text>
          <View style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}>
            <View style={{ flex: 1 }}>
              <Text>앱 잠금</Text>
              <Text variant="caption" color="muted">
                1분 넘게 앱을 떠났다 돌아오면 Face ID·지문으로 잠금을 풀어요.
              </Text>
            </View>
            <Switch
              value={appLock}
              onValueChange={(v) => void toggleLock(v)}
              trackColor={{ true: t.colors.primary }}
              accessibilityLabel="앱 잠금"
            />
          </View>
        </View>
      )}
      <View style={{ marginTop: 24 }}>
        {row('회원 탈퇴', () => router.push('/settings/delete'), 'destructive')}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  group: { marginTop: 20, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
