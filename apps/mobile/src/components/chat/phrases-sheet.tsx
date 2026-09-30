import { ApiError } from '@shop/api-client';
import { CHAT_PHRASE_MAX, CHAT_PHRASES_MAX } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizePhrase } from '@/components/chat/localize';
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
  const { t: tr } = useTranslation(['chat', 'common']);
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
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : tr('phrases.saveFailed')),
  });
  // 기본 문구(서버가 주는 한국어)는 지금 언어로 보여주고, 편집해 저장하면 그 언어로 저장된다
  const phrases = (list.data?.phrases ?? []).map(localizePhrase);
  const row = [styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch }];

  return (
    <Sheet title={tr('phrases.title')} onClose={onClose}>
      {list.isPending ? (
        <Loading variant="spinner" />
      ) : draft ? (
        <>
          <Text color="muted">{tr('phrases.max', { count: CHAT_PHRASES_MAX })}</Text>
          {draft.map((p, i) => (
            <View key={`${i}-${p}`} style={row}>
              <Text style={{ flex: 1 }}>{p}</Text>
              <Button
                title={tr('common:action.delete')}
                size="sm"
                variant="ghost"
                accessibilityLabel={tr('phrases.deleteLabel', { phrase: p })}
                onPress={() => setDraft(draft.filter((_, j) => j !== i))}
              />
            </View>
          ))}
          {draft.length < CHAT_PHRASES_MAX && (
            <>
              <Field
                label={tr('phrases.newPhrase')}
                maxLength={CHAT_PHRASE_MAX}
                value={added}
                onChangeText={setAdded}
              />
              <Button
                title={tr('phrases.add')}
                variant="outline"
                disabled={!added.trim()}
                onPress={() => {
                  setDraft([...draft, added.trim()]);
                  setAdded('');
                }}
              />
            </>
          )}
          <Button
            title={tr('common:action.save')}
            block
            loading={save.isPending}
            onPress={() => save.mutate(draft)}
          />
          <Button title={tr('common:action.cancel')} block variant="ghost" onPress={() => setDraft(null)} />
        </>
      ) : (
        <>
          <Text color="muted">{tr('phrases.pickHint')}</Text>
          {phrases.length ? (
            phrases.map((p) => (
              <Pressable key={p} accessibilityRole="button" onPress={() => onPick(p)} style={row}>
                <Text style={{ flex: 1 }}>{p}</Text>
              </Pressable>
            ))
          ) : (
            <Text color="muted">{tr('phrases.empty')}</Text>
          )}
          <Button title={tr('phrases.edit')} block variant="outline" onPress={() => setDraft(phrases)} />
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
