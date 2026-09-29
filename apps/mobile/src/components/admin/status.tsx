import { Text } from '@/components/ui/text';

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'negative';

const COLOR = {
  neutral: 'muted',
  positive: 'primary',
  warning: 'warning',
  negative: 'destructive',
} as const;

/**
 * 관리자 목록의 상태 표시: 배경 없는 색 글자.
 * 한 줄에 상태는 하나만 두고, 정상·기본 상태는 굳이 표시하지 않는다.
 */
export function StatusText({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return (
    <Text variant="label" color={COLOR[tone]} numberOfLines={1}>
      {label}
    </Text>
  );
}
