import { ApiError } from '@shop/api-client';
import { NOTIFICATION_CATEGORIES, QUIET_HOURS, type NotificationPrefs } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Linking, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { notificationCategoryLabel } from '@/i18n/labels';
import { api } from '@/lib/api';
import { registerPush } from '@/lib/push';
import { useTheme } from '@/theme';

type PushState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 16 }]}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description && (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: t.colors.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** 알림 설정: 기기 푸시 권한 + 받을 알림 종류 + 방해 금지 시간 (알림함에는 항상 쌓인다) */
export default function NotificationSettingsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const [push, setPush] = useState<PushState | null>(null);
  const q = useQuery({ queryKey: ['notification-prefs'], queryFn: api.notifications.prefs });
  const save = useMutation({
    mutationFn: (p: NotificationPrefs) => api.notifications.setPrefs(p),
    onMutate: (p) => qc.setQueryData(['notification-prefs'], p),
    onError: (e) => {
      Alert.alert(e instanceof ApiError ? e.message : tr('common:state.saveFailed'));
      void qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });

  const check = useCallback(async () => {
    if (Platform.OS === 'web') return setPush('unsupported');
    const p = await Notifications.getPermissionsAsync();
    setPush(p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied');
  }, []);
  useEffect(() => {
    void check();
    // 기기 설정에서 권한을 바꾸고 돌아오면 다시 확인한다
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
  }, [check]);

  /**
   * 기기 알림 켜기: 아직 묻지 않았으면 시스템 권한 창을, 기기 설정에서 꺼 둔 상태면 설정 화면을 연다.
   * 권한이 있으면 이 기기를 푸시 대상으로 등록한다 (시뮬레이터는 토큰을 받지 못해도 권한 상태는 켜진다).
   */
  const enable = async () => {
    if (Platform.OS === 'web') return;
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) {
      if (!current.canAskAgain) return void Linking.openSettings();
      const asked = await Notifications.requestPermissionsAsync();
      if (!asked.granted) return void check();
    }
    await registerPush().catch(() => false);
    await check();
  };
  // 켜진 알림은 앱에서 끌 수 없어 기기 설정으로 안내한다
  const disable = () =>
    Alert.alert(tr('notificationSettings.disableTitle'), tr('notificationSettings.disableMessage'), [
      { text: tr('common:action.cancel'), style: 'cancel' },
      { text: tr('common:action.openSettings'), onPress: () => void Linking.openSettings() },
    ]);

  if (q.isPending) return <Loading variant="plain-list" />;
  const data = q.data;
  if (!data) return null;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: tr('common:screen.notificationSettings') }} />
      <SwitchRow
        label={tr('notificationSettings.device')}
        description={push ? tr(`notificationSettings.push.${push}`) : tr('notificationSettings.checking')}
        value={push === 'granted'}
        disabled={!push || push === 'unsupported'}
        onChange={(on) => (on ? void enable() : disable())}
      />
      <Text variant="h3" style={{ marginTop: 16 }}>
        {tr('notificationSettings.pushHeading')}
      </Text>
      <Text variant="small" color="muted">
        {tr('notificationSettings.pushNotice')}
      </Text>
      {NOTIFICATION_CATEGORIES.map((c) => (
        <SwitchRow
          key={c}
          label={notificationCategoryLabel(c).label}
          description={notificationCategoryLabel(c).description}
          value={data.push[c]}
          onChange={(v) => save.mutate({ ...data, push: { ...data.push, [c]: v } })}
        />
      ))}
      <SwitchRow
        label={tr('notificationSettings.quietHours')}
        description={tr('notificationSettings.quietHoursDescription', {
          start: QUIET_HOURS.start,
          end: QUIET_HOURS.end,
        })}
        value={data.quietHours}
        onChange={(v) => save.mutate({ ...data, quietHours: v })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 6, paddingBottom: 48 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
