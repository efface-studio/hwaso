import type { OtaPlatform, OtaUpdateDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useAdminAction } from '@/components/admin/admin-list';
import { AdminRow, RowSection } from '@/components/admin/row';
import { StatusText, type StatusTone } from '@/components/admin/status';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Segmented } from '@/components/ui/segmented';
import { Empty, Loading } from '@/components/ui/state';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { actionSheet } from '@/lib/action-sheet';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { readable } from '@/hooks/use-layout';

const PLATFORMS: { value: OtaPlatform; label: string }[] = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
];
const ROLLOUTS = [10, 25, 50, 100];
const short = (v: string | null | undefined) => (v ? `${v.slice(0, 8)}…` : '-');

function status(u: OtaUpdateDto, live: boolean): { label: string; tone: StatusTone } | undefined {
  if (u.status === 'ROLLED_BACK') return { label: '되돌림', tone: 'neutral' };
  if (u.kind === 'ROLLBACK') return { label: '내장 버전', tone: 'warning' };
  if (u.critical) return { label: '긴급', tone: 'negative' };
  if (live) return { label: '배포 중', tone: 'positive' };
  return undefined;
}

/**
 * 앱 업데이트(OTA): 배포 목록 · 배포 비율 · 되돌리기.
 * 배포는 개발 PC 의 스크립트로 한다 (pnpm --filter @shop/mobile ota:publish) — docs/MOBILE_RELEASE.md
 */
export default function UpdatesScreen() {
  const t = useTheme();
  const [platform, setPlatform] = useState<OtaPlatform>(Platform.OS === 'android' ? 'android' : 'ios');
  const list = useQuery({
    queryKey: ['admin', 'ota', platform],
    queryFn: () => api.admin.ota.list({ platform }),
  });
  const pull = usePullRefresh(list.refetch);
  const rollout = useAdminAction(
    (id: string, rolloutPercent: number) => api.admin.ota.update(id, { rolloutPercent }),
    '배포 비율을 바꿨어요',
    ['ota'],
  );
  const rollback = useAdminAction(
    (u: OtaUpdateDto, target: 'previous' | 'embedded') =>
      api.admin.ota.rollback({
        platform: u.platform,
        runtimeVersion: u.runtimeVersion,
        channel: u.channel,
        target,
      }),
    '되돌렸어요. 앱을 다음에 열 때 적용돼요.',
    ['ota'],
  );

  // 런타임·채널마다 가장 최근의 배포 중인 업데이트가 실제로 내려가는 것
  const live = new Set<string>();
  const seen = new Set<string>();
  for (const u of list.data ?? []) {
    const k = `${u.runtimeVersion}:${u.channel}`;
    if (u.status !== 'ACTIVE' || seen.has(k)) continue;
    seen.add(k);
    live.add(u.id);
  }

  const confirm = (title: string, message: string, onOk: () => void) =>
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel' },
      { text: '되돌리기', style: 'destructive', onPress: onOk },
    ]);

  const open = (u: OtaUpdateDto) =>
    actionSheet(u.message || '업데이트', [
      ...ROLLOUTS.filter((p) => p !== u.rolloutPercent).map((p) => ({
        label: `${p}% 기기에 배포`,
        onPress: () => rollout.mutate([u.id, p]),
      })),
      {
        label: '이전 업데이트로 되돌리기',
        destructive: true,
        onPress: () =>
          confirm(
            '이전 업데이트로 되돌릴까요?',
            '가장 최근 업데이트를 내리고 바로 전 업데이트를 다시 배포해요.',
            () => rollback.mutate([u, 'previous']),
          ),
      },
      {
        label: '스토어 버전으로 되돌리기',
        destructive: true,
        onPress: () =>
          confirm('스토어 버전으로 되돌릴까요?', '이 런타임의 모든 기기가 앱에 내장된 번들로 돌아가요.', () =>
            rollback.mutate([u, 'embedded']),
          ),
      },
    ]);

  const segment = (
    <View style={styles.segment}>
      <Segmented label="플랫폼" value={platform} onChange={setPlatform} options={PLATFORMS} />
    </View>
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      {segment}
      <RowSection title="이 기기" footer="같은 런타임(네이티브 코드가 같은 빌드)끼리만 업데이트를 받아요.">
        <AdminRow title="런타임" value={short(Updates.runtimeVersion)} />
        <AdminRow
          title="실행 중인 번들"
          value={Updates.isEmbeddedLaunch ? '스토어 버전' : short(Updates.updateId)}
          meta={Updates.createdAt ? dt(Updates.createdAt.toISOString()) : undefined}
        />
      </RowSection>
      {list.isPending ? (
        <Loading variant="plain-list" />
      ) : !list.data?.length ? (
        <Empty title="배포한 업데이트가 없어요." />
      ) : (
        <RowSection title="배포 기록">
          {list.data.map((u) => {
            const s = status(u, live.has(u.id));
            const actionable = live.has(u.id) && u.kind === 'UPDATE';
            return (
              <AdminRow
                key={u.id}
                title={u.message || (u.kind === 'ROLLBACK' ? '스토어 버전으로 되돌림' : '(메모 없음)')}
                detail={`런타임 ${short(u.runtimeVersion)} · ${u.channel} · 자산 ${u.assetCount}개`}
                meta={dt(u.createdAt)}
                value={u.kind === 'UPDATE' ? `${u.rolloutPercent}%` : undefined}
                status={s && <StatusText label={s.label} tone={s.tone} />}
                dimmed={u.status === 'ROLLED_BACK'}
                reserveChevron
                accessibilityLabel={[u.message, s?.label, `${u.rolloutPercent}%`, dt(u.createdAt)]
                  .filter(Boolean)
                  .join(', ')}
                onPress={actionable ? () => open(u) : undefined}
              />
            );
          })}
        </RowSection>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { ...readable, paddingBottom: 48 },
  segment: { paddingHorizontal: 16, paddingTop: 8 },
});
