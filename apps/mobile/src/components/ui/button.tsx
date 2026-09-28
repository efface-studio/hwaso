import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from './text';

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
          opacity: inactive ? 0.4 : pressed ? 0.8 : 1,
          alignSelf: block ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...props}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={c[fg[variant]]} /> : icon}
        <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} color={fg[variant]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
