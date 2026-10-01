import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from './text';

/**
 * 체크박스 한 줄 (약관 동의 등). 스크린리더에 checkbox 로 읽힌다.
 * trailing 에는 '보기' 같은 링크를 둔다 — 줄 전체를 눌러도 체크가 바뀐다.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  strong = false,
  trailing,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** '모두 동의' 처럼 굵게 */
  strong?: boolean;
  trailing?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.row, { minHeight: t.touch }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        onPress={() => {
          selectionHaptic();
          onChange(!checked);
        }}
        style={[styles.press, { minHeight: t.touch }]}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: checked ? t.colors.primary : t.colors.borderStrong,
              backgroundColor: checked ? t.colors.primary : 'transparent',
            },
          ]}
        >
          {checked && (
            <Text variant="caption" color="primaryForeground">
              ✓
            </Text>
          )}
        </View>
        <Text variant={strong ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
          {label}
        </Text>
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  press: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
