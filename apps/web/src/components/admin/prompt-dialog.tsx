'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';

/** 사유 입력이 필요한 관리자 조치 확인창 */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label = '사유',
  confirmLabel,
  destructive,
  pending,
  children,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  label?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  children?: ReactNode;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            disabled={text.trim().length < 2}
            loading={pending}
            onClick={() => onSubmit(text.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        <Field label={label} required hint="감사 로그에 남고, 필요하면 회원에게 안내돼요.">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
