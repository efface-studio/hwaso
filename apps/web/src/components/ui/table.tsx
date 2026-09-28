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

/**
 * 모바일(<768px) 카드: 첫 글자 머리글 열은 제목, 나머지 글자 머리글 열은 "라벨: 값",
 * 빈 머리글 열(작업 버튼)은 하단, 요소 머리글(모두 선택 체크박스 등)은 목록 위 막대.
 */
function Cards<T>({ columns, rows, rowKey, empty }: TableProps<T>) {
  const labeled = columns.filter((c) => typeof c.header === 'string' && c.header);
  const [title, ...fields] = labeled;
  const leading = columns.filter((c) => c.header && typeof c.header !== 'string');
  const actions = columns.filter((c) => !c.header);
  return (
    <div data-testid="table-cards" className="flex flex-col gap-2 md:hidden">
      {leading.length > 0 && rows.length > 0 && (
        <div className="flex items-center gap-2 px-1 text-small text-muted">
          {leading.map((c) => (
            <span key={c.key}>{c.header}</span>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-sm border border-border bg-background px-3 py-10 text-center text-small text-muted">
          {empty ?? '데이터가 없습니다.'}
        </p>
      ) : (
        rows.map((r) => (
          <div
            key={rowKey(r)}
            data-testid={`table-card-${rowKey(r)}`}
            className="flex flex-col gap-2 rounded-sm border border-border bg-background p-3 text-small"
          >
            <div className="flex items-start gap-2">
              {leading.map((c) => (
                <span key={c.key} className="pt-0.5">
                  {c.cell(r)}
                </span>
              ))}
              {title && <div className="min-w-0 flex-1 text-body-strong">{title.cell(r)}</div>}
            </div>
            {fields.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {fields.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-muted">{c.header}</dt>
                    <dd className="min-w-0 text-right break-words">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {actions.length > 0 && (
              <div className="-mb-1 flex flex-wrap justify-end gap-1 border-t border-border-soft pt-1">
                {actions.map((c) => (
                  <span key={c.key}>{c.cell(r)}</span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/** 관리자·판매자 화면용 테이블. 데스크톱은 표, 모바일은 카드 목록 */
export function Table<T>(props: TableProps<T>) {
  return (
    <>
      <Cards {...props} />
      <TableGrid {...props} />
    </>
  );
}

function TableGrid<T>({ columns, rows, rowKey, empty }: TableProps<T>) {
  return (
    <div className="hidden overflow-x-auto rounded-sm border border-border md:block">
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
