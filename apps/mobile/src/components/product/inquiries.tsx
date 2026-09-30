import { ApiError } from '@shop/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { formatRelative } from '@/i18n/format';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('product:inquiry.genericError'));

/** 상품 문의: 작성(비밀 문의) ↔ 삭제, 판매자 답변 ↔ 답변 수정 (웹과 같은 규칙) */
export function Inquiries({ productId, isMine }: { productId: string; isMine: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['product', 'common']);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const key = ['inquiries', productId, user?.id ?? 'anon'];
  const q = useQuery({ queryKey: key, queryFn: () => api.market.inquiries(productId) });
  const [question, setQuestion] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['inquiries', productId] });
  const onError = (e: unknown) => Alert.alert(errMsg(e));

  const ask = useMutation({
    mutationFn: () => api.market.ask(productId, { question: question.trim(), isPrivate }),
    onSuccess: () => {
      setQuestion('');
      setPrivate(false);
      Alert.alert(tr('inquiry.submitted'), tr('inquiry.submittedBody'));
      void refresh();
    },
    onError,
  });
  const remove = useMutation({ mutationFn: api.market.deleteInquiry, onSuccess: refresh, onError });
  const reply = useMutation({
    mutationFn: (id: string) => api.market.answerInquiry(id, answer.trim()),
    onSuccess: () => {
      setAnswering(null);
      setAnswer('');
      void refresh();
    },
    onError,
  });
  const inputStyle = [
    t.inputType(true),
    styles.input,
    { color: t.colors.foreground, borderColor: t.colors.borderStrong },
  ];

  return (
    <View style={{ gap: 12 }}>
      {!isMine && (
        <View style={{ gap: 8 }}>
          <TextInput
            accessibilityLabel={tr('inquiry.inputLabel')}
            multiline
            maxLength={1000}
            value={question}
            onChangeText={setQuestion}
            editable={!!user}
            placeholder={user ? tr('inquiry.placeholder') : tr('inquiry.loginPlaceholder')}
            placeholderTextColor={t.colors.faint}
            style={inputStyle}
          />
          <View style={styles.row}>
            <Switch
              value={isPrivate}
              onValueChange={setPrivate}
              trackColor={{ true: t.colors.primary }}
              accessibilityLabel={tr('inquiry.private')}
            />
            <Text variant="small" style={{ flex: 1 }}>
              {tr('inquiry.private')}
            </Text>
            <Button
              title={tr('inquiry.submit')}
              variant="secondary"
              size="sm"
              loading={ask.isPending}
              onPress={() => {
                if (!user) return router.push('/login');
                if (question.trim().length < 2) return Alert.alert(tr('inquiry.tooShort'));
                ask.mutate();
              }}
            />
          </View>
        </View>
      )}
      {q.isPending ? (
        <Text variant="small" color="muted">
          {tr('common:state.loading')}…
        </Text>
      ) : !q.data?.length ? (
        <Text variant="small" color="muted">
          {tr('inquiry.empty')}
        </Text>
      ) : (
        q.data.map((x) => (
          <View key={x.id} style={[styles.item, { borderColor: t.colors.borderSoft }]}>
            <View style={styles.row}>
              <Text style={{ flex: 1 }} color={x.hidden ? 'muted' : 'foreground'}>
                {x.isPrivate ? '🔒 ' : ''}
                {x.question}
              </Text>
              {x.isMine && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('inquiry.deleteA11y')}
                  hitSlop={8}
                  onPress={() =>
                    Alert.alert(tr('inquiry.deleteConfirm'), undefined, [
                      { text: tr('common:action.cancel'), style: 'cancel' },
                      {
                        text: tr('common:action.delete'),
                        style: 'destructive',
                        onPress: () => remove.mutate(x.id),
                      },
                    ])
                  }
                >
                  <Text variant="caption" color="muted">
                    {tr('common:action.delete')}
                  </Text>
                </Pressable>
              )}
            </View>
            <Text variant="caption" color="muted">
              {x.authorNickname} · {formatRelative(x.createdAt)}
            </Text>
            {x.answer && (
              <View style={[styles.answer, { backgroundColor: t.colors.backgroundSoft }]}>
                <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>
                  {tr('inquiry.sellerAnswer')}
                </Text>
                <Text>{x.answer}</Text>
              </View>
            )}
            {isMine &&
              !x.hidden &&
              (answering === x.id ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    accessibilityLabel={tr('inquiry.answerLabel')}
                    multiline
                    maxLength={1000}
                    value={answer}
                    onChangeText={setAnswer}
                    placeholderTextColor={t.colors.faint}
                    style={inputStyle}
                  />
                  <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                    <Button
                      title={tr('common:action.cancel')}
                      variant="ghost"
                      size="sm"
                      onPress={() => setAnswering(null)}
                    />
                    <Button
                      title={tr('inquiry.submitAnswer')}
                      size="sm"
                      loading={reply.isPending}
                      disabled={!answer.trim()}
                      onPress={() => reply.mutate(x.id)}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  title={x.answer ? tr('inquiry.editAnswer') : tr('inquiry.answer')}
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setAnswering(x.id);
                    setAnswer(x.answer ?? '');
                  }}
                  style={{ alignSelf: 'flex-start' }}
                />
              ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    minHeight: 80,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  item: { gap: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  answer: { gap: 2, padding: 10, borderRadius: 6, marginTop: 4 },
});
