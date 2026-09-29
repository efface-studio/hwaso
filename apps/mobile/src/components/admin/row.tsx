import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityRole } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/**
 * 관리자 화면의 기본 한 줄 (iOS 목록 행):
 * [앞 요소] 제목          값   ›
 *           설명          상태
 *           메타
 * 값·상태는 오른쪽 한 열로 세로 가운데에 둔다. 누를 수 있으면 chevron, 누르는 동안 배경을 살짝 칠한다.
 */
export function AdminRow({
  title,
  value,
  detail,
  status,
  meta,
  leading,
  children,
  onPress,
  disabled,
  dimmed,
  chevron = !!onPress,
  reserveChevron = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
}: {
  title: ReactNode;
  /** 오른쪽 열 위 (금액·건수 등) */
  value?: ReactNode;
  /** 둘째 줄 (이메일·판매자 등) */
  detail?: ReactNode;
  /** 오른쪽 열 아래 (StatusText) */
  status?: ReactNode;
  /** 셋째 줄 (날짜 등 보조 정보) */
  meta?: ReactNode;
  leading?: ReactNode;
  /** 행 아래에 붙는 내용 (인라인 도구 등) */
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** 삭제·만료처럼 흐리게 보일 행 */
  dimmed?: boolean;
  chevron?: boolean;
  /** chevron 이 없어도 그 자리를 비워 둔다 (같은 묶음의 다른 행과 숫자 끝을 맞출 때) */
  reserveChevron?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
}) {
  const t = useTheme();
  const text = (v: ReactNode, variant: 'small' | 'caption', color: 'muted' | 'faint') =>
    typeof v === 'string' || typeof v === 'number' ? (
      <Text variant={variant} color={color} numberOfLines={1} style={styles.grow}>
        {v}
      </Text>
    ) : (
      <View style={styles.grow}>{v}</View>
    );

  const body = (
    <>
      {leading}
      <View style={styles.main}>
        {typeof title === 'string' ? (
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {detail != null && text(detail, 'small', 'muted')}
        {meta != null && text(meta, 'caption', 'faint')}
        {children}
      </View>
      {/* 값·상태는 오른쪽 한 열에 쌓아 chevron 과 같은 세로 중심에 둔다 (행마다 숫자 위치가 같게) */}
      {(value != null || status != null) && (
        <View style={styles.trailing}>
          {typeof value === 'string' || typeof value === 'number' ? (
            <Text variant="body" style={styles.value}>
              {value}
            </Text>
          ) : (
            value
          )}
          {status}
        </View>
      )}
      {chevron ? (
        <Icon ios="chevron.right" android="chevron_right" color="faint" size={13} />
      ) : (
        // chevron 이 없는 행도 오른쪽 끝을 맞춘다
        reserveChevron && <View style={styles.chevronSpace} />
      )}
    </>
  );

  const style = [styles.row, { minHeight: t.touch + 8 }, dimmed && { opacity: 0.5 }];
  if (!onPress)
    return (
      <View style={style} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && { backgroundColor: t.colors.surface2 }]}
    >
      {body}
    </Pressable>
  );
}

/** 행 사이 구분선 (앞 요소가 있으면 글자 시작점까지 들여 쓴다) */
export function RowSeparator({ inset = 16 }: { inset?: number }) {
  const t = useTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: t.colors.border }} />
  );
}

/** 제목이 있는 행 묶음 (카드 없이 행과 구분선만) */
export function RowSection({
  title,
  footer,
  inset,
  children,
}: {
  title?: string;
  footer?: string;
  inset?: number;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section}>
      {title && (
        <Text variant="label" color="muted" accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      )}
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 && <RowSeparator inset={inset} />}
          {row}
        </Fragment>
      ))}
      {footer && (
        <Text variant="caption" color="faint" style={styles.sectionFooter}>
          {footer}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  main: { flex: 1, gap: 2 },
  trailing: { alignItems: 'flex-end', justifyContent: 'center', gap: 2, maxWidth: '45%' },
  chevronSpace: { width: 8 },
  grow: { flex: 1 },
  value: { fontVariant: ['tabular-nums'] },
  section: { paddingTop: 20 },
  sectionTitle: { paddingHorizontal: 16, paddingBottom: 4 },
  sectionFooter: { paddingHorizontal: 16, paddingTop: 6 },
});
