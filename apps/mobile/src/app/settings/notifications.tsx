import { ApiError } from '@shop/api-client';
import { NOTIFICATION_CATEGORIES, QUIET_HOURS, type NotificationPrefs } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Linking, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { notificationCategoryLabel } from '@/i18n/labels';
import { api } from '@/lib/api';
import { registerPush } from '@/lib/push';
import { useTheme } from '@/theme';

type OsState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const allCategories = (v: boolean) =>
  Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, v])) as NotificationPrefs['push'];

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
    <View
      style={[
        styles.row,
        { borderColor: t.colors.borderSoft, minHeight: t.touch + 16, opacity: disabled ? 0.45 : 1 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description && (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        )}
      </View>
      <Switch
        style={{ alignSelf: 'center' }}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: t.colors.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * 알림 설정: 푸시 알림 스위치 하나 + 받을 알림 종류 + 방해 금지 시간 (알림함에는 항상 쌓인다).
 * 푸시는 기기 권한과 받을 알림 종류가 모두 켜져 있어야 온다. 스위치 하나로 둘을 함께 다룬다.
 */
export default function NotificationSettingsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const [os, setOs] = useState<OsState | null>(null);
  // 설정 앱으로 보냈다가 돌아오면, 권한을 켰을 때 이어서 켜기를 마친다
  const resumeAfterSettings = useRef(false);
  const q = useQuery({ queryKey: ['notification-prefs'], queryFn: api.notifications.prefs });
  const save = useMutation({
    mutationFn: (p: NotificationPrefs) => api.notifications.setPrefs(p),
    onMutate: (p) => qc.setQueryData(['notification-prefs'], p),
    onError: (e) => {
      Alert.alert(e instanceof ApiError ? e.message : tr('common:state.saveFailed'));
      void qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
  const data = q.data;

  const check = useCallback(async (): Promise<OsState> => {
    if (Platform.OS === 'web') {
      setOs('unsupported');
      return 'unsupported';
    }
    const p = await Notifications.getPermissionsAsync();
    const next: OsState = p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
    setOs(next);
    return next;
  }, []);

  /** 권한이 생긴 뒤: 이 기기를 푸시 대상으로 등록하고, 받을 알림이 모두 꺼져 있으면 모두 켠다 */
  const finishEnable = useCallback(async () => {
    await registerPush().catch(() => false);
    const prefs = qc.getQueryData<NotificationPrefs>(['notification-prefs']);
    if (prefs && !NOTIFICATION_CATEGORIES.some((c) => prefs.push[c])) {
      save.mutate({ ...prefs, push: allCategories(true) });
    }
  }, [qc, save]);

  useEffect(() => {
    void check();
    // 기기 설정에서 권한을 바꾸고 돌아오면 다시 확인한다
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void check().then((next) => {
        if (resumeAfterSettings.current && next === 'granted') void finishEnable();
        resumeAfterSettings.current = false;
      });
    });
    return () => sub.remove();
  }, [check, finishEnable]);

  /**
   * 켜기: 아직 묻지 않았으면 시스템 권한 창을 띄운다.
   * 기기 설정에서 꺼 둔 상태면 팝업으로 알리고 설정 화면으로 보낸다.
   */
  const enable = async () => {
    const state = await check();
    if (state === 'unsupported') return;
    if (state === 'denied') {
      Alert.alert(
        tr('notificationSettings.blockedTitle'),
        tr('notificationSettings.blockedMessage', { app: tr('common:brand.name') }),
        [
          { text: tr('common:action.cancel'), style: 'cancel' },
          {
            text: tr('notificationSettings.goToSettings'),
            onPress: () => {
              resumeAfterSettings.current = true;
              void Linking.openSettings();
            },
          },
        ],
      );
      return;
    }
    if (state === 'undetermined') {
      const asked = await Notifications.requestPermissionsAsync();
      await check();
      if (!asked.granted) return;
    }
    await finishEnable();
  };
  // 끄기: 기기 권한은 그대로 두고 받을 알림을 모두 끈다 (설정 앱으로 보내지 않는다)
  const disable = () => data && save.mutate({ ...data, push: allCategories(false) });

  if (q.isPending) return <Loading variant="plain-list" />;
  if (!data) return null;
  const anyOn = NOTIFICATION_CATEGORIES.some((c) => data.push[c]);
  const on = os === 'granted' && anyOn;
  const status = !os
    ? tr('notificationSettings.checking')
    : os === 'unsupported'
      ? tr('notificationSettings.state.unsupported')
      : on
        ? tr('notificationSettings.state.on')
        : os === 'denied'
          ? tr('notificationSettings.state.blocked')
          : tr('notificationSettings.state.off');
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: tr('common:screen.notificationSettings') }} />
      <SwitchRow
        label={tr('notificationSettings.heading')}
        description={status}
        value={on}
        disabled={!os || os === 'unsupported'}
        onChange={(v) => (v ? void enable() : disable())}
      />
      <Text variant="label" color="muted" style={styles.group}>
        {tr('notificationSettings.categories')}
      </Text>
      {NOTIFICATION_CATEGORIES.map((c) => (
        <SwitchRow
          key={c}
          label={notificationCategoryLabel(c).label}
          description={notificationCategoryLabel(c).description}
          value={on && data.push[c]}
          disabled={!on}
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
        disabled={!on}
        onChange={(v) => save.mutate({ ...data, quietHours: v })}
      />
      <Text variant="caption" color="muted" style={{ marginTop: 8 }}>
        {tr('notificationSettings.always')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 6, paddingBottom: 48 },
  group: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
