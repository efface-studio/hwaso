'use client';

import { parsePrice, formatNumber } from '@shop/shared';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export const controlClass =
  'w-full rounded-sm border border-border-strong bg-background px-3 text-body text-foreground placeholder:text-faint transition-colors hover:border-foreground/40 focus:border-foreground focus:outline-none disabled:bg-surface-2 disabled:text-faint aria-[invalid=true]:border-destructive';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
}

/** 라벨·도움말·오류 메시지를 접근성 속성과 함께 묶는다 */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-label text-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-small text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, 'h-11', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(controlClass, 'min-h-28 py-2.5', className)} {...props} />;
  },
);

interface PriceInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onValueChange: (v: number | null) => void;
}

/** 원 단위 정수만 입력. 천 단위 콤마 표시 */
export const PriceInput = forwardRef<HTMLInputElement, PriceInputProps>(function PriceInput(
  { value, onValueChange, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        className={cn(controlClass, 'tabular h-11 pr-9 text-right', className)}
        value={value == null ? '' : formatNumber(value)}
        onChange={(e) => onValueChange(parsePrice(e.target.value))}
        {...props}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body text-muted">
        원
      </span>
    </div>
  );
});
