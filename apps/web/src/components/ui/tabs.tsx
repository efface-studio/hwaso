'use client';

import { Tabs as T } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <T.List className={cn('flex gap-6 overflow-x-auto border-b border-border', className)}>{children}</T.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <T.Trigger
      value={value}
      className="-mb-px h-11 shrink-0 border-b-2 border-transparent text-label text-muted transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
    >
      {children}
    </T.Trigger>
  );
}
