'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useThemeStore, type ThemePreference } from '@/stores/theme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: '시스템', Icon: Monitor },
  { value: 'light', label: '라이트', Icon: Sun },
  { value: 'dark', label: '다크', Icon: Moon },
];

export function ThemeSelect() {
  const { preference, setPreference } = useThemeStore();
  return (
    <div
      role="radiogroup"
      aria-label="화면 테마"
      className="inline-flex rounded-sm border border-border p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => setPreference(value)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-caption',
            preference === value ? 'bg-surface-2 text-foreground' : 'text-muted hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
