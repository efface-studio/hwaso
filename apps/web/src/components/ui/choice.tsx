'use client';

import { Check } from 'lucide-react';
import { Checkbox as C, RadioGroup as R, Switch as Sw } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, label, disabled, className }: CheckboxProps) {
  return (
    <label className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-body', className)}>
      <C.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-background data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <C.Indicator>
          <Check className="size-3.5 text-primary-foreground" strokeWidth={3} aria-hidden />
        </C.Indicator>
      </C.Root>
      <span>{label}</span>
    </label>
  );
}

interface RadioGroupProps<T extends string> {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: ReactNode; description?: ReactNode }[];
  'aria-label'?: string;
  className?: string;
}

export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...aria
}: RadioGroupProps<T>) {
  return (
    <R.Root
      {...aria}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      className={cn('flex flex-col gap-2', className)}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-start gap-3 rounded-sm border border-border p-3 has-[[data-state=checked]]:border-primary"
        >
          <R.Item
            value={o.value}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong data-[state=checked]:border-primary"
          >
            <R.Indicator className="size-2.5 rounded-full bg-primary" />
          </R.Item>
          <span className="flex flex-col">
            <span className="text-body-strong">{o.label}</span>
            {o.description && <span className="text-small text-muted">{o.description}</span>}
          </span>
        </label>
      ))}
    </R.Root>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, description, disabled }: SwitchProps) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span className="flex flex-col">
        <span className="text-body">{label}</span>
        {description && <span className="text-small text-muted">{description}</span>}
      </span>
      <Sw.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-10 shrink-0 rounded-full bg-border-strong transition-colors data-[state=checked]:bg-primary disabled:opacity-40"
      >
        <Sw.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
      </Sw.Root>
    </label>
  );
}
