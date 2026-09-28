'use client';

import type { ImageDto } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Clock, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MediaImage } from '@/components/product/media-image';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const RECENT_KEY = 'shop-recent-searches';
const RECENT_MAX = 10;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // 저장소를 못 쓰는 환경에서는 최근 검색어를 기억하지 않는다
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Option =
  | { kind: 'recent'; label: string }
  | { kind: 'product'; id: string; label: string; image: ImageDto | null }
  | { kind: 'artist'; id: string; label: string; sub: string | null }
  | { kind: 'category'; slug: string; label: string };

/**
 * 검색 자동완성 (WAI-ARIA combobox). 최근 검색어 저장 ↔ 개별 삭제 ↔ 전체 삭제.
 */
export function SearchAutocomplete({
  initial = '',
  autoFocus,
  className,
}: {
  initial?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const term = useDebounced(q.trim(), 150);

  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => setQ(initial), [initial]);

  const { data } = useQuery({
    queryKey: ['suggest', term],
    queryFn: ({ signal }) => api.market.suggest(term, signal),
    enabled: term.length > 0,
    staleTime: 60_000,
  });

  const options: Option[] = useMemo(() => {
    if (!term) return recent.map((label) => ({ kind: 'recent' as const, label }));
    if (!data) return [];
    return [
      ...data.categories.map((c) => ({ kind: 'category' as const, slug: c.slug, label: c.name })),
      ...data.artists.map((a) => ({
        kind: 'artist' as const,
        id: a.id,
        label: a.name,
        sub:
          [a.nameEn, a.birthYear ? `${a.birthYear}–${a.deathYear ?? ''}` : null]
            .filter(Boolean)
            .join(' · ') || null,
      })),
      ...data.products.map((p) => ({ kind: 'product' as const, id: p.id, label: p.title, image: p.image })),
    ];
  }, [term, data, recent]);

  const go = (value: string) => {
    const t = value.trim();
    setOpen(false);
    inputRef.current?.blur();
    if (!t) {
      router.push('/search');
      return;
    }
    const next = [t, ...recent.filter((r) => r !== t)];
    setRecent(next);
    writeRecent(next);
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  const choose = (o: Option) => {
    setOpen(false);
    if (o.kind === 'recent') return go(o.label);
    if (o.kind === 'product') return router.push(`/products/${o.id}`);
    if (o.kind === 'artist') return router.push(`/artists/${o.id}`);
    router.push(`/category/${o.slug}`);
  };

  const removeRecent = (label: string) => {
    const next = recent.filter((r) => r !== label);
    setRecent(next);
    writeRecent(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter' && active >= 0 && options[active]) {
      e.preventDefault();
      choose(options[active]!);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go(q);
  };

  const showList = open && (options.length > 0 || (!term && recent.length === 0));
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <form role="search" onSubmit={onSubmit} className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        name="q"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        aria-label="작품, 작가, 시대, 소재 검색"
        placeholder="작품명, 작가, 시대, 소재 검색"
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-sm bg-surface-2 pr-9 pl-9 text-body placeholder:text-faint focus:bg-background focus:outline-2 focus:outline-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {q && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            setQ('');
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-surface shadow-md">
          {!term && (
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <span className="text-caption font-semibold text-muted">최근 검색어</span>
              {recent.length > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setRecent([]);
                    writeRecent([]);
                  }}
                  className="text-caption text-muted hover:text-foreground"
                >
                  전체 삭제
                </button>
              )}
            </div>
          )}
          {!term && recent.length === 0 && (
            <p className="px-3 pb-3 text-small text-muted">최근 검색어가 없습니다.</p>
          )}
          <ul id={listId} role="listbox" aria-label="검색 제안" className="py-1">
            {options.map((o, i) => (
              <li
                key={`${o.kind}-${o.label}-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 px-3 text-body',
                  i === active ? 'bg-surface-2' : 'hover:bg-surface-2',
                )}
              >
                {o.kind === 'recent' && <Clock className="size-4 shrink-0 text-muted" aria-hidden />}
                {o.kind === 'product' && (
                  <span className="size-9 shrink-0 overflow-hidden bg-background-soft">
                    <MediaImage image={o.image} alt="" sizes="40px" />
                  </span>
                )}
                {o.kind === 'artist' && <span className="shrink-0 text-caption text-muted">작가</span>}
                {o.kind === 'category' && <span className="shrink-0 text-caption text-muted">카테고리</span>}
                <span className="min-w-0 flex-1 truncate">
                  {o.label}
                  {o.kind === 'artist' && o.sub && (
                    <span className="ml-2 text-small text-muted">{o.sub}</span>
                  )}
                </span>
                {o.kind === 'recent' && (
                  <button
                    type="button"
                    aria-label={`최근 검색어 ${o.label} 삭제`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecent(o.label);
                    }}
                    className="rounded-full p-1 text-muted hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
