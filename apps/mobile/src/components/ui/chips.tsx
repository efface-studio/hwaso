import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from './text';

/**
 * 가로 스크롤 선택 칩 (정렬·필터·카테고리).
 * 테두리 없이 옅은 배경만 두고, 고른 칩은 강조 색을 옅게 깔고 글자를 강조 색·굵게 — 한 줄에 여러 개가 있어도 시끄럽지 않게.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              selectionHaptic();
              onChange(o.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              {
                minHeight: t.senior ? 44 : 34,
                borderRadius: t.radius.full,
                backgroundColor: on ? `${t.colors.primary}29` : t.colors.surface2,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              variant="label"
              color={on ? 'primary' : 'foreground2'}
              style={on ? styles.onLabel : undefined}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, justifyContent: 'center' },
  onLabel: { fontWeight: '700' },
});
