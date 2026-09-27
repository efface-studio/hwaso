'use client';

import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const overlay = 'fixed inset-0 z-50 bg-overlay';

export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-surface shadow-md focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 p-5 pb-3">
            <div className="flex flex-col gap-1">
              <D.Title className="text-h3">{title}</D.Title>
              {description ? (
                <D.Description className="text-small text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
              )}
            </div>
            <D.Close className="-m-2 rounded-sm p-2 text-muted hover:bg-surface-2" aria-label="닫기">
              <X className="size-5" aria-hidden />
            </D.Close>
          </div>
          {children && <div className="overflow-y-auto px-5 pb-5">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface SheetProps extends Omit<DialogProps, 'footer'> {
  side?: 'right' | 'bottom' | 'left';
  footer?: ReactNode;
}

/** Drawer(데스크톱: 측면) / Bottom Sheet(모바일: 하단) */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  className,
}: SheetProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface shadow-md focus:outline-none',
            side === 'right' && 'inset-y-0 right-0 w-full max-w-md border-l border-border',
            side === 'left' && 'inset-y-0 left-0 w-full max-w-sm border-r border-border',
            side === 'bottom' &&
              'inset-x-0 bottom-0 max-h-[88vh] rounded-t-lg border-t border-border pb-[env(safe-area-inset-bottom)]',
            className,
          )}
        >
          {side === 'bottom' && (
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden />
          )}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <D.Title className="text-h3">{title}</D.Title>
            <D.Close className="-m-2 rounded-sm p-2 text-muted hover:bg-surface-2" aria-label="닫기">
              <X className="size-5" aria-hidden />
            </D.Close>
          </div>
          <D.Description className="sr-only">
            {description ?? (typeof title === 'string' ? title : '')}
          </D.Description>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
