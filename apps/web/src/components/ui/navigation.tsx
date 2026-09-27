'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Accordion as A } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="현재 위치">
      <ol className="flex flex-wrap items-center gap-1 text-small text-muted">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 text-faint" aria-hidden />}
              {it.href && !last ? (
                <Link href={it.href} className="hover:text-foreground">
                  {it.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="text-foreground">
                  {it.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}

const pageBtn = 'inline-flex size-9 items-center justify-center rounded-sm text-label disabled:opacity-30';

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  return (
    <nav aria-label="페이지" className="flex items-center justify-center gap-1">
      <button
        type="button"
        className={cn(pageBtn, 'hover:bg-surface-2')}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="이전 페이지"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onPageChange(p)}
          className={cn(
            pageBtn,
            p === page ? 'bg-secondary text-secondary-foreground' : 'hover:bg-surface-2',
          )}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        className={cn(pageBtn, 'hover:bg-surface-2')}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="다음 페이지"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}

interface AccordionProps {
  items: { id: string; title: ReactNode; content: ReactNode }[];
  defaultOpen?: string[];
}

export function Accordion({ items, defaultOpen }: AccordionProps) {
  return (
    <A.Root type="multiple" defaultValue={defaultOpen} className="border-t border-border">
      {items.map((it) => (
        <A.Item key={it.id} value={it.id} className="border-b border-border">
          <A.Header>
            <A.Trigger className="group flex h-14 w-full items-center justify-between text-left text-body-strong">
              {it.title}
              <ChevronDown
                className="size-4 text-muted transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </A.Trigger>
          </A.Header>
          <A.Content className="pb-5 text-body text-foreground-2">{it.content}</A.Content>
        </A.Item>
      ))}
    </A.Root>
  );
}
