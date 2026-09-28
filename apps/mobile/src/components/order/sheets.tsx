import { CARRIERS } from '@shop/shared';
import { useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioList } from '@/components/ui/radio';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Text variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
          <Button title="닫기" variant="ghost" size="sm" onPress={onClose} />
        </View>
        {children}
      </ScrollView>
    </Modal>
  );
}

/** 사유 입력 (주문 취소·환불 요청·환불 거절 공용) */
export function ReasonSheet({
  title,
  description,
  confirmLabel,
  minLength = 1,
  destructive,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  minLength?: number;
  destructive?: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Sheet title={title} onClose={onClose}>
      {description && <Text color="muted">{description}</Text>}
      <Field
        label="사유"
        multiline
        maxLength={1000}
        value={reason}
        onChangeText={setReason}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
        hint={minLength > 1 ? `${minLength}자 이상 입력해주세요.` : undefined}
      />
      <Button
        title={confirmLabel}
        variant={destructive ? 'destructive' : 'primary'}
        size="lg"
        disabled={reason.trim().length < minLength}
        loading={pending}
        onPress={() => onSubmit(reason.trim())}
      />
    </Sheet>
  );
}

/** 발송 처리·송장 수정: 택배사 + 운송장 번호 */
export function ShipSheet({
  initial,
  pending,
  onClose,
  onSubmit,
}: {
  initial?: { carrier: string; trackingNumber: string | null };
  pending: boolean;
  onClose: () => void;
  onSubmit: (v: { carrier: string; trackingNumber: string }) => void;
}) {
  const [carrier, setCarrier] = useState<string>(initial?.carrier ?? CARRIERS[0].name);
  const [tracking, setTracking] = useState(initial?.trackingNumber ?? '');
  const noTracking = CARRIERS.find((c) => c.name === carrier)?.url === null;
  return (
    <Sheet title={initial ? '송장 정보 수정' : '발송 처리'} onClose={onClose}>
      <Text color="muted">구매자에게 배송 조회 링크와 함께 안내돼요.</Text>
      <RadioList
        label="택배사"
        value={carrier}
        onChange={setCarrier}
        options={CARRIERS.map((c) => ({ value: c.name, label: c.name }))}
      />
      <Field
        label={noTracking ? '운송장·접수 번호 (또는 연락처)' : '운송장 번호'}
        hint={noTracking ? '전문 운송·직접 전달은 예약 번호나 연락처 뒷자리를 적어주세요.' : undefined}
        keyboardType={noTracking ? 'default' : 'number-pad'}
        maxLength={50}
        value={tracking}
        onChangeText={setTracking}
      />
      <Button
        title={initial ? '수정' : '발송 완료'}
        size="lg"
        loading={pending}
        disabled={tracking.trim().length < 4}
        onPress={() => onSubmit({ carrier, trackingNumber: tracking.trim() })}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center' },
});
