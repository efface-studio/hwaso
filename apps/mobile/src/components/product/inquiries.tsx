import { ApiError } from '@shop/api-client';
import { formatRelativeTime } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 문제가 발생했어요.');

/** 상품 문의: 작성(비밀 문의) ↔ 삭제, 판매자 답변 ↔ 답변 수정 (웹과 같은 규칙) */
export function Inquiries({ productId, isMine }: { productId: string; isMine: boolean }) {
  const t = useTheme();
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
      Alert.alert('문의를 등록했어요', '판매자가 답변하면 알려드릴게요.');
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
    t.type('body'),
    styles.input,
    { color: t.colors.foreground, borderColor: t.colors.borderStrong },
  ];

  return (
    <View style={{ gap: 12 }}>
      {!isMine && (
        <View style={{ gap: 8 }}>
          <TextInput
            accessibilityLabel="문의 내용"
            multiline
            maxLength={1000}
            value={question}
            onChangeText={setQuestion}
            editable={!!user}
            placeholder={
              user ? '작품 상태, 배송, 추가 사진 등 궁금한 점을 남겨주세요.' : '로그인 후 문의할 수 있어요.'
            }
            placeholderTextColor={t.colors.faint}
            style={inputStyle}
          />
          <View style={styles.row}>
            <Switch
              value={isPrivate}
              onValueChange={setPrivate}
              trackColor={{ true: t.colors.primary }}
              accessibilityLabel="비밀 문의"
            />
            <Text variant="small" style={{ flex: 1 }}>
              비밀 문의
            </Text>
            <Button
              title="문의하기"
              variant="secondary"
              size="sm"
              loading={ask.isPending}
              onPress={() => {
                if (!user) return router.push('/login');
                if (question.trim().length < 2) return Alert.alert('문의 내용을 2자 이상 입력해주세요.');
                ask.mutate();
              }}
            />
          </View>
        </View>
      )}
      {q.isPending ? (
        <Text variant="small" color="muted">
          불러오는 중…
        </Text>
      ) : !q.data?.length ? (
        <Text variant="small" color="muted">
          아직 문의가 없어요.
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
                  accessibilityLabel="문의 삭제"
                  hitSlop={8}
                  onPress={() =>
                    Alert.alert('문의를 삭제할까요?', undefined, [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: () => remove.mutate(x.id) },
                    ])
                  }
                >
                  <Text variant="caption" color="muted">
                    삭제
                  </Text>
                </Pressable>
              )}
            </View>
            <Text variant="caption" color="muted">
              {x.authorNickname} · {formatRelativeTime(x.createdAt)}
            </Text>
            {x.answer && (
              <View style={[styles.answer, { backgroundColor: t.colors.backgroundSoft }]}>
                <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>
                  판매자 답변
                </Text>
                <Text>{x.answer}</Text>
              </View>
            )}
            {isMine &&
              !x.hidden &&
              (answering === x.id ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    accessibilityLabel="답변"
                    multiline
                    maxLength={1000}
                    value={answer}
                    onChangeText={setAnswer}
                    placeholderTextColor={t.colors.faint}
                    style={inputStyle}
                  />
                  <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                    <Button title="취소" variant="ghost" size="sm" onPress={() => setAnswering(null)} />
                    <Button
                      title="답변 등록"
                      size="sm"
                      loading={reply.isPending}
                      disabled={!answer.trim()}
                      onPress={() => reply.mutate(x.id)}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  title={x.answer ? '답변 수정' : '답변하기'}
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
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  item: { gap: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  answer: { gap: 2, padding: 10, borderRadius: 6, marginTop: 4 },
});
