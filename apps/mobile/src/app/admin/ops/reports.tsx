import {
  REPORT_REASON_LABEL,
  REPORT_STATUSES,
  REPORT_STATUS_LABEL,
  REPORT_TARGETS,
  REPORT_TARGET_LABEL,
  type AdminReportRow,
  type ReportAction,
} from '@shop/shared';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdminList, useAdminAction } from '@/components/admin/admin-list';
import { AdminRow } from '@/components/admin/row';
import { StatusText } from '@/components/admin/status';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioList } from '@/components/ui/radio';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { dt, REPORT_ACTION_LABEL, REPORT_ACTIONS_BY_TARGET } from '@/lib/admin';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type ResolveStatus = 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';

const STATUS_OPTIONS: { value: ResolveStatus; label: string }[] = [
  { value: 'RESOLVED', label: '조치 완료' },
  { value: 'IN_REVIEW', label: '확인 중으로 표시' },
  { value: 'REJECTED', label: '반려 (문제 없음)' },
];

/** 신고 대상 화면: 작품·사용자는 대상 자체, 후기·메시지는 작성자 프로필 */
const targetHref = (r: AdminReportRow): Href | null =>
  r.targetType === 'PRODUCT'
    ? { pathname: '/products/[id]', params: { id: r.targetId } }
    : r.targetType === 'USER'
      ? { pathname: '/users/[id]', params: { id: r.targetId } }
      : r.targetOwner
        ? { pathname: '/users/[id]', params: { id: r.targetOwner.id } }
        : null;

const isPending = (r: AdminReportRow) => r.status === 'OPEN' || r.status === 'IN_REVIEW';

/** 신고 처리 시트: 같은 대상의 열린 신고 모두에 적용된다 */
function Resolve({ r, onClose }: { r: AdminReportRow; onClose: () => void }) {
  const t = useTheme();
  const [status, setStatus] = useState<ResolveStatus>('RESOLVED');
  const [action, setAction] = useState<ReportAction>('none');
  const [resolution, setResolution] = useState('');
  const run = useAdminAction(
    (id: string, body: { status: ResolveStatus; resolution: string; action: ReportAction }) =>
      api.admin.resolveReport(id, body),
    '신고를 처리했어요',
    ['reports', 'dashboard', 'products', 'users'],
  );
  const href = targetHref(r);
  const submit = () =>
    run.mutate(
      [r.id, { status, resolution: resolution.trim(), action: status === 'RESOLVED' ? action : 'none' }],
      { onSuccess: onClose },
    );

  return (
    <Sheet title="신고 처리" onClose={onClose}>
      <Text variant="small" color="muted">
        {REPORT_TARGET_LABEL[r.targetType]} · {REPORT_REASON_LABEL[r.reason]} · 같은 대상 신고{' '}
        {r.sameTargetCount}건
      </Text>
      <View style={[styles.quote, { borderColor: t.colors.borderStrong }]}>
        <Text>{r.targetPreview}</Text>
      </View>
      {!!r.detail && (
        <Text variant="small" color="muted">
          신고 내용: {r.detail}
        </Text>
      )}
      {href && (
        <Button
          title="대상 보기"
          variant="outline"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          onPress={() => {
            // 시트를 닫은 뒤 이동해야 새 화면이 시트 아래에 가려지지 않는다
            onClose();
            router.push(href);
          }}
        />
      )}
      <View style={styles.section}>
        <Text variant="label" color="muted" accessibilityRole="header">
          처리 결과
        </Text>
        <RadioList label="처리 결과" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </View>
      {status === 'RESOLVED' && (
        <View style={styles.section}>
          <Text variant="label" color="muted" accessibilityRole="header">
            조치
          </Text>
          <RadioList
            label="조치"
            value={action}
            onChange={setAction}
            options={REPORT_ACTIONS_BY_TARGET[r.targetType].map((a) => ({
              value: a,
              label: REPORT_ACTION_LABEL[a],
            }))}
          />
        </View>
      )}
      <Field
        label="신고자에게 보일 답변"
        multiline
        maxLength={500}
        counter
        value={resolution}
        onChangeText={setResolution}
        placeholder="선택 사항"
        hint="처리 결과는 같은 대상의 열린 신고 모두에 적용돼요."
        style={styles.textarea}
      />
      <Button title="처리" block loading={run.isPending} onPress={submit} />
    </Sheet>
  );
}

/** 처리할 신고만 상태를 보인다 (접수 > 확인 중, 끝난 신고는 표시 없음) */
function statusOf(r: AdminReportRow) {
  if (r.status === 'OPEN') return <StatusText label={REPORT_STATUS_LABEL.OPEN} tone="negative" />;
  if (r.status === 'IN_REVIEW') return <StatusText label={REPORT_STATUS_LABEL.IN_REVIEW} tone="warning" />;
  return null;
}

/** 신고 한 줄: 대상 미리보기 · 대상과 사유(누적) · 상태 · 신고자·일시·내용 */
function ReportRow({ r, onPress }: { r: AdminReportRow; onPress: () => void }) {
  const detail = [
    REPORT_TARGET_LABEL[r.targetType],
    r.targetOwner?.nickname,
    REPORT_REASON_LABEL[r.reason],
    r.sameTargetCount > 1 ? `누적 ${r.sameTargetCount}건` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const meta = [`신고자 ${r.reporter.nickname}`, dt(r.createdAt), r.detail ? `“${r.detail}”` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <AdminRow
      title={r.targetPreview}
      detail={detail}
      status={statusOf(r)}
      meta={meta}
      accessibilityLabel={`${r.targetPreview}, ${detail}, ${REPORT_STATUS_LABEL[r.status]}, ${meta}`}
      accessibilityHint={isPending(r) ? '신고 처리' : '신고 대상 보기'}
      onPress={onPress}
    />
  );
}

/** 신고: 접수·확인 중인 신고는 눌러서 처리, 끝난 신고는 대상으로 이동 */
export default function ReportsScreen() {
  const [target, setTarget] = useState<AdminReportRow | null>(null);
  const open = (r: AdminReportRow) => {
    if (isPending(r)) return setTarget(r);
    const href = targetHref(r);
    if (href) router.push(href);
  };
  return (
    <>
      <AdminList<AdminReportRow>
        queryKey="reports"
        fetcher={api.admin.reports}
        searchPlaceholder="대상 ID · 신고 내용"
        filters={[
          {
            key: 'status',
            label: '상태',
            initial: 'OPEN',
            options: REPORT_STATUSES.map((s) => ({ value: s, label: REPORT_STATUS_LABEL[s] })),
          },
          {
            key: 'targetType',
            label: '대상',
            options: REPORT_TARGETS.map((v) => ({ value: v, label: REPORT_TARGET_LABEL[v] })),
          },
        ]}
        emptyTitle="신고가 없어요."
        renderItem={(r) => <ReportRow r={r} onPress={() => open(r)} />}
      />
      {target && <Resolve key={target.id} r={target} onClose={() => setTarget(null)} />}
    </>
  );
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 2, paddingLeft: 12, paddingVertical: 2 },
  section: { gap: 8 },
  textarea: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12, paddingBottom: 12 },
});
