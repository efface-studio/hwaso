import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { ShimmerText } from './shimmer-text';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  icon,
  block,
  style,
  onPress,
  ...props
}: Omit<PressableProps, 'style'> & {
  title: string;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const c = t.colors;
  const bg: Record<Variant, string> = {
    primary: c.primary,
    secondary: c.secondary,
    outline: 'transparent',
    ghost: 'transparent',
    destructive: c.destructive,
  };
  const fg: Record<Variant, keyof typeof c> = {
    primary: 'primaryForeground',
    secondary: 'secondaryForeground',
    outline: 'foreground',
    ghost: 'foreground',
    destructive: 'primaryForeground',
  };
  const height =
    size === 'lg' ? t.controlHeight + 4 : size === 'sm' ? Math.max(36, t.touch - 8) : t.controlHeight;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={(e) => {
        selectionHaptic();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: size === 'sm' ? 12 : 18,
          backgroundColor: bg[variant],
          borderRadius: t.radius.sm,
          borderWidth: variant === 'outline' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: c.borderStrong,
          // 진행 중(loading)은 흐리게 하지 않는다 — 비활성(disabled)만 흐리게
          opacity: disabled ? 0.4 : pressed && !loading ? 0.8 : 1,
          alignSelf: block ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...props}
    >
      <View style={styles.row}>
        {icon}
        {/* 진행 중이면 글자가 스켈레톤처럼 반짝인다 */}
        <ShimmerText active={!!loading} variant={size === 'sm' ? 'label' : 'bodyStrong'} color={fg[variant]}>
          {title}
        </ShimmerText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
