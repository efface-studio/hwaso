import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** 서버 reasonSchema 와 같은 최소 길이 */
const MIN = 2;

type PromptOptions = {
  title: string;
  description?: string;
  label?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** false 면 비워도 된다 (예: 인증서 반려 사유는 선택) */
  required?: boolean;
};
type PromptState = { options: PromptOptions; resolve: (v: string | null) => void } | null;

const usePrompt = create<{ prompt: PromptState }>(() => ({ prompt: null }));

/**
 * 사유 입력 창을 띄우고 입력값을 돌려준다 (취소하면 null). 관리자 조치는 사유가 감사 로그에 남는다.
 * 루트 레이아웃의 PromptHost 가 그린다.
 */
export function promptReason(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => usePrompt.setState({ prompt: { options, resolve } }));
}

export function PromptHost() {
  const t = useTheme();
  const prompt = usePrompt((s) => s.prompt);
  const [text, setText] = useState('');
  if (!prompt) return null;
  const { options: o } = prompt;
  const required = o.required ?? true;
  const close = (value: string | null) => {
    prompt.resolve(value);
    usePrompt.setState({ prompt: null });
    setText('');
  };
  const ok = !required || text.trim().length >= MIN;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={() => close(null)} />
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: t.colors.surface, borderRadius: t.radius.lg }]}
        >
          <Text variant="h3">{o.title}</Text>
          {o.description && (
            <Text variant="small" color="muted">
              {o.description}
            </Text>
          )}
          <Field
            label={o.label ?? '사유'}
            multiline
            autoFocus
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
                onPress={() => close(text.trim())}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { padding: 20, gap: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
