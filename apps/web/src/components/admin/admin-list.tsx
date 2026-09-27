'use client';

import { ApiError } from '@shop/api-client';
import type { Paged } from '@shop/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Pagination } from '@/components/ui/navigation';
import { Select } from '@/components/ui/select';
import { Table, type Column } from '@/components/ui/table';
import { toast } from '@/stores/toast';

export type Filters = Record<string, string | undefined>;

/** 관리자 목록 공통: 검색어·필터·페이지 상태와 조회 */
export function useAdminList<T>(
  key: string,
  fetcher: (q: Record<string, string | number | undefined>) => Promise<Paged<T>>,
  initial: Filters = {},
) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(initial);
  const query = useQuery({
    queryKey: ['admin', key, page, q, filters],
    queryFn: () => fetcher({ page, size: 20, q: q || undefined, ...filters }),
    placeholderData: keepPreviousData,
  });
  return {
    query,
    page,
    setPage,
    q,
    search: (v: string) => {
      setQ(v);
      setPage(1);
    },
    filters,
    setFilter: (k: string, v: string | undefined) => {
      setFilters((f) => ({ ...f, [k]: v }));
      setPage(1);
    },
  };
}

/** 관리자 쓰기 작업: 성공 토스트 + 관련 목록 무효화 */
export function useAdminAction<V>(
  fn: (v: V) => Promise<unknown>,
  success: string,
  invalidate: string[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success);
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: ['admin', k] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '처리하지 못했습니다.'),
  });
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export function AdminList<T>({
  list,
  columns,
  rowKey,
  filters = [],
  searchPlaceholder = '검색',
  toolbar,
}: {
  list: ReturnType<typeof useAdminList<T>>;
  columns: Column<T>[];
  rowKey: (r: T) => string;
  filters?: FilterDef[];
  searchPlaceholder?: string;
  toolbar?: ReactNode;
}) {
  const [text, setText] = useState(list.q);
  const data = list.query.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-60 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            list.search(text.trim());
          }}
        >
          <Input
            aria-label="검색어"
            placeholder={searchPlaceholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="outline" aria-label="검색">
            <Search className="size-4" aria-hidden />
          </Button>
        </form>
        {filters.map((f) => (
          <Select
            key={f.key}
            aria-label={f.label}
            value={list.filters[f.key] ?? 'all'}
            onValueChange={(v) => list.setFilter(f.key, v === 'all' ? undefined : v)}
            options={[{ value: 'all', label: `${f.label}: 전체` }, ...f.options]}
            className="w-40"
          />
        ))}
        {toolbar}
      </div>
      <p className="text-caption text-muted" aria-live="polite">
        {data ? `총 ${data.total.toLocaleString('ko-KR')}건` : '불러오는 중…'}
      </p>
      <div className={list.query.isFetching ? 'opacity-60 transition-opacity' : undefined}>
        <Table
          columns={columns}
          rows={data?.items ?? []}
          rowKey={rowKey}
          empty={list.query.isPending ? '불러오는 중…' : '결과가 없어요.'}
        />
      </div>
      {data && (
        <Pagination
          page={list.page}
          totalPages={Math.ceil(data.total / data.size)}
          onPageChange={list.setPage}
        />
      )}
    </div>
  );
}

export const dt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';
