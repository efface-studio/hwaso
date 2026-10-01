import { ApiError } from '@shop/api-client';
import type { SecurityEventDto } from '@shop/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, Stack } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import i18n, { currentLanguage, LOCALE } from '@/i18n';
import { api } from '@/lib/api';
import { useIntegrity } from '@/lib/integrity';
import { biometricKey } from '@/lib/reauth';
import { useScreenGuard } from '@/lib/screen-guard';
import { useTheme } from '@/theme';

const when = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE[currentLanguage()], {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 설정 화면과 같은 한 줄: 제목(+설명) · 오른쪽 값 */
function Row({ children, right, onPress }: { children: ReactNode; right?: ReactNode; onPress?: () => void }) {
  const t = useTheme();
  const style = [styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }];
  if (!onPress)
    return (
      <View style={style}>
        <View style={{ flex: 1, gap: 2 }}>{children}</View>
        {right}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...style, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
      {right}
      <Text color="faint">›</Text>
    </Pressable>
  );
}

/**
 * 보안: 생체 인증 사용 · 기기 상태 · 로그인 기기 · 최근 활동.
 * 켜면 결제·정산 계좌 변경 같은 작업을 비밀번호 대신 Face ID 로 확인한다 (docs/SECURITY.md).
 */
export default function SecurityScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const risky = useIntegrity((s) => s.flags.length > 0);
  const [biometric, setBiometric] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useScreenGuard();

  useEffect(() => {
    void biometricKey
      .id()
      .then((id) => setBiometric(!!id))
      .catch(() => setBiometric(false));
  }, []);

  const events = useInfiniteQuery({
    queryKey: ['security', 'events'],
    queryFn: ({ pageParam }) => api.me.securityEvents(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pull = usePullRefresh(events.refetch);

  const toggle = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!on) {
        await api.auth.removeBiometric();
        await biometricKey.clear();
        setBiometric(false);
        Alert.alert(tr('security.biometricOff'));
      } else {
        const [hardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hardware || !enrolled) return Alert.alert(tr('security.biometricUnavailable'));
        // 등록 자체도 본인 확인이 필요하다 (서버가 REAUTH_REQUIRED 를 주면 본인 확인 창이 뜬다)
        const key = await api.auth.registerBiometric({
          deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android',
        });
        await biometricKey.save(key.keyId, key.secret);
        setBiometric(true);
        Alert.alert(tr('security.biometricOn'));
      }
      void qc.invalidateQueries({ queryKey: ['security', 'events'] });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'REAUTH_REQUIRED'))
        Alert.alert(e instanceof ApiError ? e.message : i18n.t('common:state.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const items: SecurityEventDto[] = events.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Stack.Screen options={{ title: tr('security.screenTitle') }} />

      <Text variant="label" color="muted" style={styles.group}>
        {tr('security.groupVerify')}
      </Text>
      <Row
        right={
          <Switch
            style={{ alignSelf: 'center' }}
            accessibilityLabel={tr('security.biometric')}
            value={!!biometric}
            disabled={biometric === null || busy}
            onValueChange={(v) => void toggle(v)}
            trackColor={{ true: t.colors.primary }}
          />
        }
      >
        <Text>{tr('security.biometric')}</Text>
        <Text variant="caption" color="muted">
          {tr('security.biometricHint')}
        </Text>
      </Row>

      <Text variant="label" color="muted" style={styles.group}>
        {tr('security.groupDevice')}
      </Text>
      {risky && (
        <Row
          right={<Text color="warning">{tr('security.deviceCheck')}</Text>}
          onPress={() => Alert.alert(tr('security.warningTitle'), tr('security.warningMessage'))}
        >
          <Text>{tr('security.deviceStatus')}</Text>
        </Row>
      )}
      <Row onPress={() => router.push('/settings/devices')}>
        <Text>{tr('security.devices')}</Text>
      </Row>

      <Text variant="label" color="muted" style={styles.group}>
        {tr('security.events')}
      </Text>
      {items.map((e) => (
        <Row key={e.id}>
          <Text>{tr(`security.event.${e.type}`)}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            {[e.device, when(e.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </Row>
      ))}
      {!events.isPending && !items.length && (
        <Text color="muted" style={styles.empty}>
          {tr('security.empty')}
        </Text>
      )}
      {events.hasNextPage && (
        <Button
          title={tr('security.more')}
          variant="ghost"
          loading={events.isFetchingNextPage}
          onPress={() => void events.fetchNextPage()}
        />
      )}
      <Text variant="caption" color="faint" style={styles.footer}>
        {tr('security.eventsHint')}
      </Text>
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
  empty: { paddingVertical: 16 },
  footer: { marginTop: 10 },
});
