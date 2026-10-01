import { ApiError } from '@shop/api-client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';

export const revalidate = 60;

/** 빌드 때는 비워 두고 첫 요청에 렌더해 revalidate 주기로 캐시한다 (on-demand ISR) */
export async function generateStaticParams() {
  return [];
}

async function load(id: string) {
  try {
    return await serverApi.notices.get(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const n = await load((await params).id);
  return { title: n.title, description: n.body.slice(0, 120) };
}

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const n = await load((await params).id);
  return (
    <article className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <Link href="/notices" className="text-small text-muted hover:underline">
        ← 공지사항
      </Link>
      <h1 className="mt-3 text-h1">{n.title}</h1>
      <p className="mt-2 text-small text-muted">
        <time dateTime={n.publishedAt}>{new Date(n.publishedAt).toLocaleDateString('ko-KR')}</time>
      </p>
      <div className="mt-8 text-body leading-relaxed whitespace-pre-wrap">{n.body}</div>
    </article>
  );
}
