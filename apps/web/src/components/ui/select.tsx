'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';
import { cn } from '@/lib/cn';
import { controlClass } from './field';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T | undefined;
  onValueChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  size?: 'sm' | 'md';
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = '선택',
  className,
  size = 'md',
  ...aria
}: SelectProps<T>) {
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <S.Trigger
        {...aria}
        className={cn(
          controlClass,
          'inline-flex items-center justify-between gap-2 text-left data-[placeholder]:text-faint',
          size === 'md' ? 'h-11' : 'h-9 text-small',
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-md"
        >
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-9 cursor-pointer items-center rounded-sm pr-8 pl-3 text-body outline-none select-none data-[highlighted]:bg-surface-2"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2">
                  <Check className="size-4 text-primary" aria-hidden />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
