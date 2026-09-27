import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EmptyState } from '@/components/ui/display';
import { safe, serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: '공지사항', alternates: { canonical: '/notices' } };
export const revalidate = 60;

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const data = await safe(serverApi.notices.list({ page, size: 20 }));
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <h1 className="mb-6 text-h1">공지사항</h1>
      {!data?.items.length ? (
        <EmptyState title="공지사항이 없어요" />
      ) : (
        <>
          <ul className="divide-y divide-border-soft border-y border-border-soft">
            {data.items.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notices/${n.id}`}
                  className="flex items-center gap-3 py-4 hover:bg-background-soft"
                >
                  {n.isPinned && <Badge tone="primary">공지</Badge>}
                  <span className="min-w-0 flex-1 truncate text-body">{n.title}</span>
                  <time dateTime={n.publishedAt} className="shrink-0 text-caption text-muted">
                    {new Date(n.publishedAt).toLocaleDateString('ko-KR')}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <NoticePager page={page} total={Math.ceil(data.total / data.size)} />
          </div>
        </>
      )}
    </div>
  );
}

function NoticePager({ page, total }: { page: number; total: number }) {
  if (total <= 1) return null;
  return (
    <nav aria-label="페이지" className="flex justify-center gap-2 text-label">
      {page > 1 && (
        <Link href={`/notices?page=${page - 1}`} className="px-3 py-2 hover:underline">
          이전
        </Link>
      )}
      <span className="px-3 py-2 text-muted">
        {page} / {total}
      </span>
      {page < total && (
        <Link href={`/notices?page=${page + 1}`} className="px-3 py-2 hover:underline">
          다음
        </Link>
      )}
    </nav>
  );
}
