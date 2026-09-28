'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { useToastStore } from '@/stores/toast';

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+16px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'destructive' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm animate-toast-in items-center justify-between gap-3 rounded-md px-4 py-3 text-body shadow-md',
            t.tone === 'destructive' ? 'bg-destructive text-white' : 'bg-secondary text-secondary-foreground',
          )}
        >
          {t.href ? (
            <Link
              href={t.href}
              onClick={() => dismiss(t.id)}
              className="min-w-0 flex-1 truncate hover:underline"
            >
              {t.message}
            </Link>
          ) : (
            <span>{t.message}</span>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="알림 닫기"
            className="-m-1 p-1 opacity-70 hover:opacity-100"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
