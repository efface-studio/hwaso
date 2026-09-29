import { ApiError } from '@shop/api-client';
import { CHAT_PHRASE_MAX, CHAT_PHRASES_MAX } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

const PHRASES_KEY = ['chat', 'phrases'];

/** 자주 쓰는 문구: 누르면 입력창에 넣고, 편집에서 추가·삭제 (웹과 같은 목록) */
export function PhrasesSheet({ onPick, onClose }: { onPick: (text: string) => void; onClose: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: PHRASES_KEY, queryFn: () => api.chat.phrases() });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [added, setAdded] = useState('');
  const save = useMutation({
    mutationFn: (phrases: string[]) => api.chat.savePhrases(phrases),
    onSuccess: (res) => {
      qc.setQueryData(PHRASES_KEY, res);
      setDraft(null);
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : '문구를 저장하지 못했어요.'),
  });
  const phrases = list.data?.phrases ?? [];
  const row = [styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch }];

  return (
    <Sheet title="자주 쓰는 문구" onClose={onClose}>
      {list.isPending ? (
        <Loading variant="spinner" />
      ) : draft ? (
        <>
          <Text color="muted">최대 {CHAT_PHRASES_MAX}개까지 저장할 수 있어요.</Text>
          {draft.map((p, i) => (
            <View key={`${i}-${p}`} style={row}>
              <Text style={{ flex: 1 }}>{p}</Text>
              <Button
                title="삭제"
                size="sm"
                variant="ghost"
                accessibilityLabel={`${p} 삭제`}
                onPress={() => setDraft(draft.filter((_, j) => j !== i))}
              />
            </View>
          ))}
          {draft.length < CHAT_PHRASES_MAX && (
            <>
              <Field label="새 문구" maxLength={CHAT_PHRASE_MAX} value={added} onChangeText={setAdded} />
              <Button
                title="추가"
                variant="outline"
                disabled={!added.trim()}
                onPress={() => {
                  setDraft([...draft, added.trim()]);
                  setAdded('');
                }}
              />
            </>
          )}
          <Button title="저장" block loading={save.isPending} onPress={() => save.mutate(draft)} />
          <Button title="취소" block variant="ghost" onPress={() => setDraft(null)} />
        </>
      ) : (
        <>
          <Text color="muted">누르면 입력창에 넣어드려요.</Text>
          {phrases.length ? (
            phrases.map((p) => (
              <Pressable key={p} accessibilityRole="button" onPress={() => onPick(p)} style={row}>
                <Text style={{ flex: 1 }}>{p}</Text>
              </Pressable>
            ))
          ) : (
            <Text color="muted">저장한 문구가 없어요. 편집에서 추가해보세요.</Text>
          )}
          <Button title="편집" block variant="outline" onPress={() => setDraft(phrases)} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
