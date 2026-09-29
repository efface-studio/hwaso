import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';

/**
 * 목록 행 구분선. FlatList 의 ItemSeparatorComponent 에는 이 컴포넌트를 감싼 모듈 상수를 넘긴다
 * (렌더마다 새 화살표 함수를 넘기면 구분선이 매번 새 컴포넌트로 다시 마운트된다).
 */
export function Separator({ inset = 0, soft = false }: { inset?: number; soft?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        marginLeft: inset,
        backgroundColor: soft ? t.colors.borderSoft : t.colors.border,
      }}
    />
  );
}
