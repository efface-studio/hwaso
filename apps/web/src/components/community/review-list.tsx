'use client';

import { formatRelativeTime } from '@shop/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MediaImage } from '@/components/product/media-image';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Stars } from './stars';

/** 받은 후기: 별점 분포 + 목록 (구매자·판매자 후기 구분) */
export function ReviewList({ userId }: { userId: string }) {
  const me = useAuthStore((s) => s.user);
  const [report, setReport] = useState<string | null>(null);
  const summary = useQuery({
    queryKey: ['review-summary', userId],
    queryFn: () => api.community.reviewSummary(userId),
  });
  const q = useInfiniteQuery({
    queryKey: ['reviews', userId],
    queryFn: ({ pageParam }) => api.community.reviews(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending || summary.isPending) return <Skeleton className="h-48 w-full" />;
  const s = summary.data!;
  if (!items.length) return <EmptyState icon={<MessageSquareText />} title="아직 받은 후기가 없어요" />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-6 rounded-sm border border-border p-5">
        <div className="flex flex-col items-center gap-1">
          <span className="tabular text-h1">{s.ratingAvg.toFixed(1)}</span>
          <Stars value={s.ratingAvg} />
          <span className="text-caption text-muted">후기 {s.ratingCount}개</span>
        </div>
        <ol className="flex flex-1 flex-col gap-1" aria-label="별점 분포">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = s.distribution[n - 1] ?? 0;
            return (
              <li key={n} className="flex items-center gap-2 text-caption">
                <span className="w-6 text-muted">{n}점</span>
                <span className="h-1.5 flex-1 rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-foreground"
                    style={{ width: `${s.ratingCount ? (c / s.ratingCount) * 100 : 0}%` }}
                  />
                </span>
                <span className="tabular w-6 text-right text-muted">{c}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <ul className="divide-y divide-border-soft border-y border-border-soft">
        {items.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-4">
            <div className="flex items-center gap-2">
              <Link href={`/users/${r.author.id}`} className="flex items-center gap-2 hover:underline">
                <Avatar avatarKey={r.author.avatarKey} name={r.author.nickname} size="sm" />
                <span className="text-body-strong">{r.author.nickname}</span>
              </Link>
              <span className="text-caption text-muted">
                {r.direction === 'BUYER_TO_SELLER' ? '구매자' : '판매자'} · {formatRelativeTime(r.createdAt)}
              </span>
              {me && me.id !== r.author.id && (
                <button
                  type="button"
                  onClick={() => setReport(r.id)}
                  className="ml-auto text-caption text-muted hover:underline"
                >
                  신고
                </button>
              )}
            </div>
            <Stars value={r.rating} />
            <p className="text-body whitespace-pre-wrap">{r.comment}</p>
            {r.images.length > 0 && (
              <div className="flex gap-2">
                {r.images.map((img) => (
                  <span key={img.key} className="size-20 bg-background-soft">
                    <MediaImage image={img} alt="후기 사진" sizes="80px" fit="cover" />
                  </span>
                ))}
              </div>
            )}
            <p className="text-caption text-muted">{r.productTitle}</p>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          더 보기
        </Button>
      )}
      {report && (
        <ReportDialog
          open
          onOpenChange={(v) => !v && setReport(null)}
          targetType="REVIEW"
          targetId={report}
        />
      )}
    </div>
  );
}
