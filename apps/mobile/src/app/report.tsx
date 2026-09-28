import { ApiError } from '@shop/api-client';
import {
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  REPORT_TARGETS,
  type ReportReason,
  type ReportTarget,
} from '@shop/shared';
import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioList } from '@/components/ui/radio';
import { Empty } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

const TARGET: Record<ReportTarget, string> = {
  PRODUCT: '작품',
  USER: '사용자',
  REVIEW: '후기',
  MESSAGE: '메시지',
};

/** 신고: 작품·사용자·후기·메시지 공용 모달. 처리 결과는 신고 내역에서 확인한다 */
export default function ReportScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const t = useTheme();
  const [reason, setReason] = useState<ReportReason>('FRAUD');
  const [detail, setDetail] = useState('');
  const target = REPORT_TARGETS.find((x) => x === type);
  const m = useMutation({
    mutationFn: () => api.safety.report({ targetType: target!, targetId: id, reason, detail: detail.trim() }),
    onSuccess: () => {
      Alert.alert('신고를 접수했어요', '운영팀이 확인 후 처리 결과를 알려드릴게요.');
      goBack();
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : '신고하지 못했어요.'),
  });
  if (!target || !id) return <Empty title="잘못된 요청이에요" />;

  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: `${TARGET[target]} 신고` }} />
      <Text variant="label">신고 사유</Text>
      <RadioList
        label="신고 사유"
        value={reason}
        onChange={setReason}
        options={REPORT_REASONS.map((r) => ({ value: r, label: REPORT_REASON_LABEL[r] }))}
      />
      <Field
        label="자세한 내용 (선택)"
        multiline
        maxLength={1000}
        value={detail}
        onChangeText={setDetail}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
        hint="허위 신고는 이용 제한 사유가 될 수 있어요."
      />
      <Button title="신고하기" variant="destructive" loading={m.isPending} onPress={() => m.mutate()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
});
