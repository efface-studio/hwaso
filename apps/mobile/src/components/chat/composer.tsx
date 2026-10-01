import { containsProhibited } from '@shop/shared';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { getRealtime } from '@/lib/realtime';
import { useTheme } from '@/theme';

export type ComposerHandle = {
  focus: () => void;
  /** 자주 쓰는 문구를 입력 중인 글 뒤에 붙인다 */
  append: (phrase: string) => void;
};

/**
 * 채팅 입력칸 + 첨부·보내기 버튼. 입력 중인 글은 여기서만 들고 있어
 * 한 글자 칠 때마다 대화방 화면 전체(말풍선 목록·헤더)가 다시 그려지지 않는다.
 */
export function Composer({
  ref,
  roomId,
  onSend,
  onAttach,
}: {
  ref?: Ref<ComposerHandle>;
  roomId: string;
  onSend: (body: string) => void;
  onAttach: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['chat', 'common']);
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  /** 보내기 전에 걸러진 표현 안내 (서버도 같은 기준으로 막는다) */
  const [prohibited, setProhibited] = useState(false);
  const input = useRef<TextInput>(null);
  const lastTyping = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => input.current?.focus(),
      append: (phrase) => setText((v) => (v.trim() ? `${v.trimEnd()} ${phrase}` : phrase)),
    }),
    [],
  );

  const ready = !!text.trim();
  const send = () => {
    const body = text.trim();
    if (!body) return;
    if (containsProhibited(body)) return setProhibited(true);
    setText('');
    onSend(body);
  };

  return (
    <>
      {prohibited && (
        <Text
          variant="caption"
          color="destructive"
          accessibilityLiveRegion="polite"
          style={styles.prohibited}
        >
          {tr('common:validation.prohibited')}
        </Text>
      )}
      <View
        style={[styles.composer, { borderColor: t.colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('composer.attach')}
          onPress={onAttach}
          style={[styles.round, { width: t.touch, height: t.touch }]}
        >
          <Text variant="h2">＋</Text>
        </Pressable>
        <TextInput
          ref={input}
          accessibilityLabel={tr('composer.inputLabel')}
          placeholder={tr('composer.placeholder')}
          placeholderTextColor={t.colors.faint}
          multiline
          maxLength={1000}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setProhibited(false);
            if (Date.now() - lastTyping.current > 1000) {
              lastTyping.current = Date.now();
              getRealtime().emit('chat:typing', { roomId });
            }
          }}
          style={[
            t.inputType(true),
            styles.input,
            {
              color: t.colors.foreground,
              backgroundColor: t.colors.surface2,
              minHeight: t.touch,
              // 한 줄일 때 글자가 입력칸 가운데 오도록 위아래 여백을 같게
              paddingTop: (t.touch - t.inputLineHeight) / 2,
              paddingBottom: (t.touch - t.inputLineHeight) / 2,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('composer.send')}
          disabled={!ready}
          onPress={send}
          style={[
            styles.round,
            {
              width: t.touch,
              height: t.touch,
              backgroundColor: ready ? t.colors.primary : t.colors.surface2,
            },
          ]}
        >
          <Text variant="bodyStrong" color={ready ? 'primaryForeground' : 'faint'}>
            ↑
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  prohibited: { paddingHorizontal: 16, paddingVertical: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  round: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 128,
    borderRadius: 20,
    paddingHorizontal: 14,
  },
});
