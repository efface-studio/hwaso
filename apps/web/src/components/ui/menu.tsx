'use client';

import { DropdownMenu as M, Popover as P, Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const panel =
  'z-50 min-w-40 rounded-md border border-border bg-surface p-1 shadow-md data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

export function DropdownMenu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={4}
          className={cn(panel, 'origin-(--radix-dropdown-menu-content-transform-origin)')}
        >
          {items.map((it) => (
            <M.Item
              key={it.label}
              onSelect={it.onSelect}
              className={cn(
                'flex h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-body outline-none select-none data-[highlighted]:bg-surface-2',
                it.destructive && 'text-destructive',
              )}
            >
              {it.icon}
              {it.label}
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function Popover({
  trigger,
  children,
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <P.Root>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          sideOffset={6}
          className={cn(panel, 'origin-(--radix-popover-content-transform-origin) p-4', className)}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Provider delayDuration={300}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            sideOffset={6}
            className="z-50 max-w-64 origin-(--radix-tooltip-content-transform-origin) rounded-sm bg-secondary px-2.5 py-1.5 text-caption text-secondary-foreground data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in"
          >
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
