import type { Metadata } from 'next';
import Link from 'next/link';
import { FollowList } from '@/components/community/follow-list';

export const metadata: Metadata = { title: '팔로잉', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <nav aria-label="팔로우 목록" className="mb-6 flex gap-6 border-b border-border">
        <Link
          href={`/users/${id}/followers`}

          className="-mb-px flex h-11 items-center border-b-2 border-transparent text-label text-muted aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
        >
          팔로워
        </Link>
        <Link
          href={`/users/${id}/following`}
          aria-current="page"
          className="-mb-px flex h-11 items-center border-b-2 border-transparent text-label text-muted aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
        >
          팔로잉
        </Link>
      </nav>
      <FollowList userId={id} kind="following" />
    </div>
  );
}
