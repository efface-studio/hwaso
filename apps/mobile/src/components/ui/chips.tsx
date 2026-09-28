import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './text';

/** 가로 스크롤 선택 칩 (정렬·필터) */
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
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              {
                minHeight: t.senior ? 44 : 34,
                borderRadius: t.radius.full,
                borderColor: on ? t.colors.foreground : t.colors.border,
                backgroundColor: on ? t.colors.foreground : 'transparent',
              },
            ]}
          >
            <Text variant="label" color={on ? 'background' : 'foreground'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 14, justifyContent: 'center' },
});
