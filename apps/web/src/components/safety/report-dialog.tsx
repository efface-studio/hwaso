'use client';

import { ApiError } from '@shop/api-client';
import { REPORT_REASONS, REPORT_REASON_LABEL, type ReportReason, type ReportTarget } from '@shop/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/choice';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

const TARGET: Record<ReportTarget, string> = {
  PRODUCT: '작품',
  USER: '사용자',
  REVIEW: '후기',
  MESSAGE: '메시지',
};

/** 신고: 작품·사용자·후기·메시지 공용. 운영팀이 확인 후 처리 결과를 신고 내역에 남긴다 */
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetType: ReportTarget;
  targetId: string;
}) {
  const [reason, setReason] = useState<ReportReason>('FRAUD');
  const [detail, setDetail] = useState('');
  const send = useMutation({
    mutationFn: () => api.safety.report({ targetType, targetId, reason, detail }),
    onSuccess: () => {
      toast.success('신고가 접수되었어요. 운영팀이 확인할게요.');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '신고하지 못했습니다.'),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${TARGET[targetType]} 신고`}
      description="허위 신고는 이용 제한 사유가 될 수 있어요."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="destructive" loading={send.isPending} onClick={() => send.mutate()}>
            신고하기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RadioGroup
          aria-label="신고 사유"
          value={reason}
          onValueChange={setReason}
          options={REPORT_REASONS.map((r) => ({ value: r, label: REPORT_REASON_LABEL[r] }))}
        />
        <Field label="자세한 내용 (선택)">
          {(p) => (
            <Textarea {...p} maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
