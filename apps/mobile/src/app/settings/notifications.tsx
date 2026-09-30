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
import { Icon } from '@/components/ui/icon';
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

/**
 * 기기 알림 권한. 꺼져 있으면 눈에 띄게(옅은 강조 색 · 벨 · 전체 폭 버튼), 켜져 있으면 상자 없이 한 줄로.
 */
function PushPermission({ push, onEnable }: { push: PushState | null; onEnable: () => void }) {
  const t = useTheme();
  const off = push === 'undetermined' || push === 'denied';
  if (!off)
    return (
      <View style={styles.status} accessible accessibilityLabel={push ? PUSH_TEXT[push] : '확인 중'}>
        <Icon
          ios={push === 'granted' ? 'checkmark.circle.fill' : 'bell.slash'}
          android={push === 'granted' ? 'check_circle' : 'notifications_off'}
          color={push === 'granted' ? 'primary' : 'muted'}
          size={18}
        />
        <Text variant="small" color="muted" style={{ flex: 1 }}>
          {push ? PUSH_TEXT[push] : '확인 중…'}
        </Text>
      </View>
    );
  return (
    <View style={[styles.banner, { backgroundColor: t.colors.primarySoft, borderRadius: t.radius.lg }]}>
      <View style={styles.bannerHead}>
        <View style={[styles.bell, { backgroundColor: t.colors.primary }]}>
          <Icon ios="bell.fill" android="notifications" color="primaryForeground" size={18} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">기기 알림이 꺼져 있어요</Text>
          <Text variant="small" color="muted">
            {PUSH_TEXT[push]}
          </Text>
        </View>
      </View>
      <Button title={push === 'denied' ? '설정에서 알림 허용하기' : '알림 켜기'} block onPress={onEnable} />
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

  if (q.isPending) return <Loading variant="plain-list" />;
  const data = q.data;
  if (!data) return null;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: '알림 설정' }} />
      <PushPermission push={push} onEnable={() => void enable()} />
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
  banner: { padding: 16, gap: 14 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
