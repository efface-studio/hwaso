import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './text';

/** 세로 라디오 목록 (결제 수단·신고 사유 등). 스크린리더에 radio 로 읽힌다 */
export function RadioList<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; description?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[
              styles.option,
              { minHeight: t.touch, borderColor: on ? t.colors.primary : t.colors.border },
            ]}
          >
            <View style={[styles.dot, { borderColor: on ? t.colors.primary : t.colors.borderStrong }]}>
              {on && <View style={[styles.inner, { backgroundColor: t.colors.primary }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text>{o.label}</Text>
              {o.description && (
                <Text variant="caption" color="muted">
                  {o.description}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { width: 10, height: 10, borderRadius: 5 },
});
