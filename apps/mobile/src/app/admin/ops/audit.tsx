import type { AuditLogRow } from '@shop/shared';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AdminList } from '@/components/admin/admin-list';
import { AdminRow } from '@/components/admin/row';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { AUDIT_TARGETS, dt } from '@/lib/admin';
import { api } from '@/lib/api';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
const json = (v: unknown) => (v == null ? '-' : JSON.stringify(v, null, 2));

/** 기록 한 줄: 작업명 · 처리자와 대상 · 일시·IP. 펼치면 변경 전·후 JSON 을 들여 써서 보여준다 */
function LogRow({ l, expanded, onPress }: { l: AuditLogRow; expanded: boolean; onPress: () => void }) {
  const actor = l.actor?.nickname ?? '시스템';
  return (
    <AdminRow
      title={
        <Text variant="bodyStrong" style={{ fontFamily: mono }} numberOfLines={expanded ? undefined : 1}>
          {l.action}
        </Text>
      }
      detail={
        <Text variant="small" color="muted" numberOfLines={expanded ? undefined : 1}>
          {actor} · {l.targetType} · {l.targetId}
        </Text>
      }
      meta={`${dt(l.createdAt)} · IP ${l.ip ?? '-'}`}
      value={
        <Icon
          ios={expanded ? 'chevron.up' : 'chevron.down'}
          android={expanded ? 'expand_less' : 'expand_more'}
          color="faint"
          size={13}
        />
      }
      chevron={false}
      accessibilityLabel={`${l.action}, ${actor}, ${l.targetType} ${l.targetId}, ${dt(l.createdAt)}`}
      accessibilityHint={expanded ? '변경 내용 접기' : '변경 내용 보기'}
      onPress={onPress}
    >
      {expanded && (
        <View style={styles.diff}>
          <Text variant="caption" color="muted">
            변경 전
          </Text>
          <Text variant="caption" selectable style={styles.json}>
            {json(l.before)}
          </Text>
          <Text variant="caption" color="muted" style={{ marginTop: 8 }}>
            변경 후
          </Text>
          <Text variant="caption" selectable style={styles.json}>
            {json(l.after)}
          </Text>
        </View>
      )}
    </AdminRow>
  );
}

/** 감사 로그: 관리자의 모든 변경 기록 (삭제·수정 불가). 누르면 변경 전·후를 펼친다 */
export default function AuditScreen() {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <AdminList<AuditLogRow>
      queryKey="audit"
      fetcher={api.admin.auditLogs}
      searchPlaceholder="대상 ID · 작업명"
      filters={[
        { key: 'targetType', label: '대상', options: AUDIT_TARGETS.map((v) => ({ value: v, label: v })) },
      ]}
      emptyTitle="기록이 없어요."
      extraData={expanded}
      renderItem={(l) => (
        <LogRow
          l={l}
          expanded={expanded === l.id}
          onPress={() => setExpanded((cur) => (cur === l.id ? null : l.id))}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  diff: { marginTop: 8, paddingLeft: 12, gap: 2 },
  json: { fontFamily: mono },
});
