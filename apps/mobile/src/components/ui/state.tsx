import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { Button } from './button';
import { EmptyIllustration, type EmptyKind } from '@/components/illustrations/empty';
import { SkeletonDetail, SkeletonGrid, SkeletonHome, SkeletonList } from './skeleton';
import { Text } from './text';

export type LoadingVariant = 'list' | 'plain-list' | 'grid' | 'home' | 'detail' | 'text' | 'spinner';

/**
 * 불러오는 중: 화면 모양을 흉내 내는 스켈레톤 (list 원형 사진+두 줄, plain-list 두 줄, grid 작품 카드,
 * home 배너+가로 목록, detail 큰 이미지+본문, text 본문만). 작은 영역은 spinner.
 * 목록의 ListEmptyComponent 안에서도 쓰이므로 스크롤 없는 뷰로 그린다.
 */
export function Loading({ variant = 'list' }: { variant?: LoadingVariant }) {
  const t = useTheme();
  if (variant === 'spinner')
    return (
      <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel="불러오는 중">
        <ActivityIndicator color={t.colors.muted} />
      </View>
    );
  return (
    <View style={[styles.fill, { backgroundColor: t.colors.background }]}>
      {variant === 'list' && <SkeletonList />}
      {variant === 'plain-list' && <SkeletonList avatar={false} />}
      {variant === 'grid' && <SkeletonGrid />}
      {variant === 'home' && <SkeletonHome />}
      {variant === 'detail' && <SkeletonDetail />}
      {variant === 'text' && <SkeletonDetail image={false} />}
    </View>
  );
}

/** 당겨서 새로고침하는 동안 본문 대신 스켈레톤 (ScrollView 화면용 — 목록은 data 를 비우고 ListEmptyComponent 로) */
export function RefreshSkeleton({
  refreshing,
  variant,
  children,
}: {
  refreshing: boolean;
  variant: LoadingVariant;
  children: ReactNode;
}) {
  return refreshing ? <Loading variant={variant} /> : <>{children}</>;
}

export function Empty({
  title,
  description,
  action,
  kind = 'generic',
  illustration,
}: {
  title: string;
  description?: string;
  action?: { title: string; onPress: () => void };
  /** 제목 위 그림 종류 (기본: 비어 있는 이젤) */
  kind?: EmptyKind;
  /** 직접 넣는 그림 (kind 대신) */
  illustration?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.illustration}>{illustration ?? <EmptyIllustration kind={kind} />}</View>
      <Text variant="bodyStrong" style={styles.text}>
        {title}
      </Text>
      {description && (
        <Text variant="small" color="muted" style={styles.text}>
          {description}
        </Text>
      )}
      {action && (
        <Button title={action.title} variant="outline" onPress={action.onPress} style={{ marginTop: 12 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  fill: { flex: 1 },
  illustration: { marginBottom: 16 },
  text: { textAlign: 'center' },
});
