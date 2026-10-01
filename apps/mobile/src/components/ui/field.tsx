import { forwardRef, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { useFormScrollExtraOffset } from './form-scroll';
import { Icon } from './icon';
import { Text } from './text';

/** 여러 줄 입력칸에서 커서 아래로 더 보여줄 높이 상한 — 칸이 화면보다 커도 커서가 위로 밀려나지 않게 */
const MAX_EXTRA_OFFSET = 240;

/**
 * 라벨·도움말·오류를 갖춘 입력창 (스크린리더에 라벨과 오류를 함께 읽힌다).
 * counter 를 주면 라벨 오른쪽에 글자 수(value/maxLength)를 보여준다.
 * 비밀번호(secureTextEntry)는 입력창 오른쪽 눈 버튼으로 가린 글자를 잠깐 볼 수 있다.
 */
export const Field = forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string | null; hint?: string; counter?: boolean }
>(function Field({ label, error, hint, counter, style, secureTextEntry, onFocus, onBlur, ...props }, ref) {
  const t = useTheme();
  // 여러 줄 입력칸: 포커스하면 첫 줄 아래의 칸·도움말 높이를 FormScroll 에 알려 칸 전체가 키보드 위로 오게 한다
  const setExtraOffset = useFormScrollExtraOffset();
  const below = useRef({ wrap: 0, inputY: 0 });
  const extraBelowCaret = () =>
    Math.min(MAX_EXTRA_OFFSET, Math.max(0, below.current.wrap - below.current.inputY - t.controlHeight));
  const { t: tr } = useTranslation('common');
  const showCounter = counter && props.maxLength != null;
  const [revealed, setRevealed] = useState(false);
  const secret = !!secureTextEntry;
  return (
    <View style={styles.wrap} onLayout={(e) => (below.current.wrap = e.nativeEvent.layout.height)}>
      <View style={styles.labelRow}>
        <Text variant="label">{label}</Text>
        {showCounter && (
          <Text variant="caption" color="faint" accessible={false}>
            {(props.value ?? '').length}/{props.maxLength}
          </Text>
        )}
      </View>
      <View onLayout={(e) => (below.current.inputY = e.nativeEvent.layout.y)}>
        <TextInput
          ref={ref}
          onFocus={(e) => {
            if (props.multiline) setExtraOffset?.(extraBelowCaret());
            onFocus?.(e);
          }}
          onBlur={(e) => {
            if (props.multiline) setExtraOffset?.(0);
            onBlur?.(e);
          }}
          secureTextEntry={secret && !revealed}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={t.colors.faint}
          style={[
            t.inputType(!!props.multiline),
            styles.input,
            {
              color: t.colors.foreground,
              borderColor: error ? t.colors.destructive : t.colors.borderStrong,
              minHeight: t.controlHeight,
              borderRadius: t.radius.sm,
            },
            secret && { paddingRight: t.touch + 4 },
            style,
          ]}
          {...props}
        />
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? tr('ui.hidePassword') : tr('ui.showPassword')}
            onPress={() => {
              selectionHaptic();
              setRevealed((v) => !v);
            }}
            style={({ pressed }) => [styles.reveal, { width: t.touch, opacity: pressed ? 0.5 : 1 }]}
          >
            <Icon
              ios={revealed ? 'eye.slash' : 'eye'}
              android={revealed ? 'visibility_off' : 'visibility'}
              color="muted"
              size={t.senior ? 22 : 18}
            />
          </Pressable>
        )}
      </View>
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
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  input: { borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 14 },
  reveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
