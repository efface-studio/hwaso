import * as LocalAuthentication from 'expo-local-authentication';
import { router, Stack, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { LANGUAGE_NAME } from '@/i18n';
import type ko from '@/i18n/locales/ko/my';
import { useAuthStore } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { useTheme } from '@/theme';

type GroupKey = keyof typeof ko.settings.group;
type RowKey = keyof typeof ko.settings.row;

/** 메뉴 묶음 (이름은 번역 키 — 그릴 때 지금 언어로 바꾼다) */
const GROUPS: { title: GroupKey; rows: [Href, RowKey][] }[] = [
  {
    title: 'account',
    rows: [
      ['/settings/profile', 'profile'],
      ['/settings/identity', 'identity'],
      ['/addresses', 'addresses'],
    ],
  },
  {
    title: 'security',
    rows: [
      ['/settings/password', 'password'],
      ['/settings/social', 'social'],
      ['/settings/devices', 'devices'],
      ['/settings/security', 'security'],
    ],
  },
  {
    title: 'safety',
    rows: [
      ['/settings/notifications', 'notifications'],
      ['/settings/blocks', 'blocks'],
      ['/settings/reports', 'reports'],
    ],
  },
];

/** 설정: 계정·보안·알림·안전 메뉴와 앱 잠금 */
export default function SettingsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const user = useAuthStore((s) => s.user);
  const { appLock, setAppLock } = usePrefs();
  const language = usePrefs((st) => st.language);
  if (!user) return null;

  const toggleLock = async (on: boolean) => {
    if (!on) return setAppLock(false);
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled)
      return Alert.alert(tr('settings.appLock.unavailableTitle'), tr('settings.appLock.unavailableMessage'));
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: tr('settings.appLock.prompt') });
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
      <Stack.Screen options={{ title: tr('common:screen.settings') }} />
      {GROUPS.map((g) => (
        <View key={g.title}>
          <Text variant="label" color="muted" style={styles.group}>
            {tr(`settings.group.${g.title}`)}
          </Text>
          {g.rows.map(([href, key]) => row(tr(`settings.row.${key}`), () => router.push(href)))}
        </View>
      ))}
      <View>
        <Text variant="label" color="muted" style={styles.group}>
          {tr('settings.group.app')}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/settings/language')}
          style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}
        >
          <Text style={{ flex: 1 }}>{tr('common:language.title')}</Text>
          <Text color="muted">
            {language === 'system' ? tr('common:language.system') : LANGUAGE_NAME[language]}
          </Text>
          <Text color="faint">›</Text>
        </Pressable>
        {Platform.OS !== 'web' && (
          <View style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}>
            <View style={{ flex: 1 }}>
              <Text>{tr('settings.appLock.label')}</Text>
              <Text variant="caption" color="muted">
                {tr('settings.appLock.description')}
              </Text>
            </View>
            <Switch
              style={{ alignSelf: 'center' }}
              value={appLock}
              onValueChange={(v) => void toggleLock(v)}
              trackColor={{ true: t.colors.primary }}
              accessibilityLabel={tr('settings.appLock.label')}
            />
          </View>
        )}
      </View>
      <View style={{ marginTop: 24 }}>
        {row(tr('settings.row.deleteAccount'), () => router.push('/settings/delete'), 'destructive')}
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
