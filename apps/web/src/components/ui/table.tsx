import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  empty?: ReactNode;
}

/** 관리자·판매자 화면용 테이블. 좁은 화면에서는 가로 스크롤 */
export function Table<T>({ columns, rows, rowKey, empty }: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full min-w-[640px] border-collapse text-small">
        <thead className="bg-background-soft text-left text-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('h-10 px-3 font-medium whitespace-nowrap', c.className)}
              >
                {/* 빈 머리글(작업 버튼 열)도 칸마다 머리글이 있어야 보조기기가 읽는다 */}
                {c.header || <span className="sr-only">작업</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-muted">
                {empty ?? '데이터가 없습니다.'}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)} className="border-t border-border-soft hover:bg-background-soft">
                {columns.map((c) => (
                  <td key={c.key} className={cn('h-12 px-3', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
