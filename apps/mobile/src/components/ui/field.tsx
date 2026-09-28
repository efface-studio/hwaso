import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './text';

/** 라벨·도움말·오류를 갖춘 입력창 (스크린리더에 라벨과 오류를 함께 읽힌다) */
export const Field = forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string | null; hint?: string }
>(function Field({ label, error, hint, style, ...props }, ref) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={t.colors.faint}
        style={[
          t.type('body'),
          styles.input,
          {
            color: t.colors.foreground,
            borderColor: error ? t.colors.destructive : t.colors.borderStrong,
            minHeight: t.controlHeight,
            borderRadius: t.radius.sm,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text variant="small" color="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 14 },
});
