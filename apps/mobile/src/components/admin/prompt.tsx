import { SUSPEND_PRESET_DAYS } from '@shop/shared';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { DateTimeField } from '@/components/ui/inputs';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** 서버 reasonSchema 와 같은 최소 길이 */
const MIN = 2;
const DAY = 86_400_000;
/** 창 바깥 여백 (키보드·화면 가장자리와의 간격) */
const GAP = 20;

type PromptOptions = {
  title: string;
  description?: string;
  label?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** false 면 비워도 된다 (예: 인증서 반려 사유는 선택) */
  required?: boolean;
  /** 정지 기간(영구·1/3/7/30일·직접)을 함께 고른다 */
  period?: boolean;
};

type PromptResult = { text: string; until: string | null };
type PromptState = { options: PromptOptions; resolve: (v: PromptResult | null) => void } | null;

const usePrompt = create<{ prompt: PromptState }>(() => ({ prompt: null }));

const open = (options: PromptOptions) =>
  new Promise<PromptResult | null>((resolve) => usePrompt.setState({ prompt: { options, resolve } }));

/**
 * 사유 입력 창을 띄우고 입력값을 돌려준다 (취소하면 null). 관리자 조치는 사유가 감사 로그에 남는다.
 * 관리자 레이아웃의 PromptHost 가 그린다.
 */
export async function promptReason(options: Omit<PromptOptions, 'period'>): Promise<string | null> {
  return (await open(options))?.text ?? null;
}

/** 이용 정지: 사유 + 기간. until 이 null 이면 영구 */
export function promptSuspension(
  options: Omit<PromptOptions, 'period'>,
): Promise<{ reason: string; until: string | null } | null> {
  return open({ ...options, period: true }).then((r) => r && { reason: r.text, until: r.until });
}

type Period = 'forever' | `${(typeof SUSPEND_PRESET_DAYS)[number]}` | 'custom';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'forever', label: '영구' },
  ...SUSPEND_PRESET_DAYS.map((d) => ({ value: `${d}` as Period, label: `${d}일` })),
  { value: 'custom', label: '직접 선택' },
];

/**
 * 키보드 위 남은 공간의 가운데에 창을 둔다. 키보드 높이를 프레임마다 받아 아래 여백으로 써서 키보드와 함께 움직이고,
 * 키보드가 없으면 화면 가운데. 창이 남은 공간보다 길면 창 안에서 스크롤한다.
 */
function KeyboardCentered({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useReanimatedKeyboardAnimation();
  // height 는 0 → -키보드 높이
  const pad = useAnimatedStyle(() => ({
    paddingBottom: Math.max(-height.value, insets.bottom) + GAP,
  }));
  // 빈 곳을 누르면 뒤의 배경(닫기)이 받도록 box-none
  return (
    <Animated.View pointerEvents="box-none" style={[styles.center, { paddingTop: insets.top + GAP }, pad]}>
      {children}
    </Animated.View>
  );
}

export function PromptHost() {
  const t = useTheme();
  const prompt = usePrompt((s) => s.prompt);
  const [text, setText] = useState('');
  const [period, setPeriod] = useState<Period>('forever');
  const [custom, setCustom] = useState<Date>(() => new Date(Date.now() + 7 * DAY));
  if (!prompt) return null;
  const { options: o } = prompt;
  const required = o.required ?? true;
  const close = (value: PromptResult | null) => {
    prompt.resolve(value);
    usePrompt.setState({ prompt: null });
    setText('');
    setPeriod('forever');
    setCustom(new Date(Date.now() + 7 * DAY));
  };
  const customPast = o.period && period === 'custom' && custom.getTime() <= Date.now() + 60_000;
  const ok = (!required || text.trim().length >= MIN) && !customPast;
  const until = () => {
    if (!o.period || period === 'forever') return null;
    if (period === 'custom') return custom.toISOString();
    return new Date(Date.now() + Number(period) * DAY).toISOString();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(null)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={() => close(null)} />
        <KeyboardCentered>
          <View
            accessibilityViewIsModal
            style={[styles.panel, { backgroundColor: t.colors.surface, borderRadius: t.radius.lg }]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.content}
              alwaysBounceVertical={false}
            >
              <Text variant="h3" accessibilityRole="header">
                {o.title}
              </Text>
              {o.description && (
                <Text variant="small" color="muted">
                  {o.description}
                </Text>
              )}
              {o.period && (
                <View style={styles.period}>
                  <Text variant="label">기간</Text>
                  <Chips label="정지 기간" options={PERIODS} value={period} onChange={setPeriod} />
                  {period === 'custom' && (
                    <DateTimeField
                      label="종료 일시"
                      value={custom}
                      minimumDate={new Date()}
                      onChange={setCustom}
                      error={customPast ? '지금 이후로 골라주세요.' : undefined}
                    />
                  )}
                </View>
              )}
              <Field
                label={o.label ?? '사유'}
                multiline
                autoFocus={!o.period}
                maxLength={500}
                counter
                value={text}
                onChangeText={setText}
                hint={required ? '감사 로그에 남고, 필요하면 회원에게 안내돼요.' : undefined}
                style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
              />
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button title="취소" variant="outline" block onPress={() => close(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={o.confirmLabel ?? '확인'}
                    variant={o.destructive ? 'destructive' : 'primary'}
                    block
                    disabled={!ok}
                    onPress={() => close({ text: text.trim(), until: until() })}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardCentered>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: GAP },
  // 남은 공간보다 길면 창 안에서 스크롤 (flexShrink 로 줄어든다)
  panel: { flexShrink: 1, overflow: 'hidden' },
  content: { padding: 20, gap: 14 },
  period: { gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
