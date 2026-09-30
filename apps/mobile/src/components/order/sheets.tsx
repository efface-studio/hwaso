import { CARRIERS } from '@shop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioList } from '@/components/ui/radio';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { carrierLabel } from './order-ui';

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
  const { t: tr } = useTranslation(['order', 'common']);
  const [reason, setReason] = useState('');
  return (
    <Sheet title={title} onClose={onClose}>
      {description && <Text color="muted">{description}</Text>}
      <Field
        label={tr('sheet.reason')}
        multiline
        maxLength={1000}
        value={reason}
        onChangeText={setReason}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
        hint={minLength > 1 ? tr('sheet.minLength', { count: minLength }) : undefined}
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
  const { t: tr } = useTranslation(['order', 'common']);
  const [carrier, setCarrier] = useState<string>(initial?.carrier ?? CARRIERS[0].name);
  const [tracking, setTracking] = useState(initial?.trackingNumber ?? '');
  const noTracking = CARRIERS.find((c) => c.name === carrier)?.url === null;
  return (
    <Sheet title={initial ? tr('sheet.editTracking') : tr('sheet.ship')} onClose={onClose}>
      <Text color="muted">{tr('sheet.shipNotice')}</Text>
      <RadioList
        label={tr('sheet.carrier')}
        value={carrier}
        onChange={setCarrier}
        options={CARRIERS.map((c) => ({ value: c.name, label: carrierLabel(c.name) }))}
      />
      <Field
        label={noTracking ? tr('sheet.trackingOrContact') : tr('sheet.trackingNumber')}
        hint={noTracking ? tr('sheet.trackingHint') : undefined}
        keyboardType={noTracking ? 'default' : 'number-pad'}
        maxLength={50}
        value={tracking}
        onChangeText={setTracking}
      />
      <Button
        title={initial ? tr('common:action.edit') : tr('sheet.shipped')}
        size="lg"
        loading={pending}
        disabled={tracking.trim().length < 4}
        onPress={() => onSubmit({ carrier, trackingNumber: tracking.trim() })}
      />
    </Sheet>
  );
}
