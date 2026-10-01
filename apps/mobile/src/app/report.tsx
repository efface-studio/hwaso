import { ApiError } from '@shop/api-client';
import { REPORT_REASONS, REPORT_TARGETS, type ReportReason } from '@shop/shared';
import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { RadioList } from '@/components/ui/radio';
import { Empty } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

/** 신고: 작품·사용자·후기·메시지 공용 모달. 처리 결과는 신고 내역에서 확인한다 */
export default function ReportScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const t = useTheme();
  const { t: tr } = useTranslation('product');
  const [reason, setReason] = useState<ReportReason>('FRAUD');
  const [detail, setDetail] = useState('');
  const target = REPORT_TARGETS.find((x) => x === type);
  const m = useMutation({
    mutationFn: () => api.safety.report({ targetType: target!, targetId: id, reason, detail: detail.trim() }),
    onSuccess: () => {
      Alert.alert(tr('report.received'), tr('report.receivedBody'));
      goBack();
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : tr('report.failed')),
  });
  if (!target || !id) return <Empty kind="error" title={tr('report.invalid')} />;

  return (
    <FormScroll style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: tr('report.title', { target: label('reportTarget', target) }) }} />
      <Text variant="label">{tr('report.reason')}</Text>
      <RadioList
        label={tr('report.reason')}
        value={reason}
        onChange={setReason}
        options={REPORT_REASONS.map((r) => ({ value: r, label: label('reportReason', r) }))}
      />
      <Field
        label={tr('report.detail')}
        multiline
        maxLength={1000}
        value={detail}
        onChangeText={setDetail}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
        hint={tr('report.hint')}
      />
      <Button
        title={tr('report.submit')}
        variant="destructive"
        loading={m.isPending}
        onPress={() => m.mutate()}
      />
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
});
