import { ApiError } from '@shop/api-client';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABEL,
  QUIET_HOURS,
  type NotificationPrefs,
} from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { registerPush } from '@/lib/push';
import { useTheme } from '@/theme';

type PushState = 'granted' | 'denied' | 'undetermined' | 'unsupported';
const PUSH_TEXT: Record<PushState, string> = {
  granted: '이 기기로 알림을 받고 있어요.',
  denied: '기기 설정에서 화소의 알림을 허용해주세요.',
  undetermined: '앱을 닫아도 입찰·주문·채팅 소식을 알려드려요.',
  unsupported: '이 환경에서는 푸시 알림을 받을 수 없어요.',
};

function SwitchRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
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
        trackColor={{ true: t.colors.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** 알림 설정: 기기 푸시 권한 + 받을 알림 종류 + 방해 금지 시간 (알림함에는 항상 쌓인다) */
export default function NotificationSettingsScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const [push, setPush] = useState<PushState | null>(null);
  const q = useQuery({ queryKey: ['notification-prefs'], queryFn: api.notifications.prefs });
  const save = useMutation({
    mutationFn: (p: NotificationPrefs) => api.notifications.setPrefs(p),
    onMutate: (p) => qc.setQueryData(['notification-prefs'], p),
    onError: (e) => {
      Alert.alert(e instanceof ApiError ? e.message : '저장하지 못했어요.');
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

  const enable = async () => {
    if (push === 'denied') return void Linking.openSettings();
    const ok = await registerPush().catch(() => false);
    if (!ok) Alert.alert('알림을 켜지 못했어요', '실제 기기에서 알림 권한을 허용해야 받을 수 있어요.');
    await check();
  };

  if (q.isPending) return <Loading />;
  const data = q.data;
  if (!data) return null;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: '알림 설정' }} />
      <View style={[styles.card, { borderColor: t.colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">기기 알림</Text>
          <Text variant="small" color="muted">
            {push ? PUSH_TEXT[push] : '확인 중…'}
          </Text>
        </View>
        {(push === 'undetermined' || push === 'denied') && (
          <Button title={push === 'denied' ? '설정 열기' : '켜기'} size="sm" onPress={() => void enable()} />
        )}
      </View>
      <Text variant="h3" style={{ marginTop: 16 }}>
        푸시 알림 받기
      </Text>
      <Text variant="small" color="muted">
        꺼도 알림함에는 그대로 쌓여요. 계정·운영 공지는 끌 수 없어요.
      </Text>
      {NOTIFICATION_CATEGORIES.map((c) => (
        <SwitchRow
          key={c}
          label={NOTIFICATION_CATEGORY_LABEL[c].label}
          description={NOTIFICATION_CATEGORY_LABEL[c].description}
          value={data.push[c]}
          onChange={(v) => save.mutate({ ...data, push: { ...data.push, [c]: v } })}
        />
      ))}
      <SwitchRow
        label="방해 금지 시간"
        description={`밤 ${QUIET_HOURS.start}시부터 아침 ${QUIET_HOURS.end}시까지 푸시를 보내지 않아요.`}
        value={data.quietHours}
        onChange={(v) => save.mutate({ ...data, quietHours: v })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 6, paddingBottom: 48 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
