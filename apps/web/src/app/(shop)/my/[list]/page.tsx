'use client';

import { ApiError } from '@shop/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Heart } from 'lucide-react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';
import { Breadcrumb } from '@/components/ui/navigation';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

const LISTS = {
  favorites: {
    title: '관심 작품',
    queryFn: api.market.favorites,
    Icon: Heart,
    empty: '하트를 눌러 마음에 드는 작품을 저장하세요.',
  },
  recent: {
    title: '최근 본 작품',
    queryFn: api.market.recent,
    Icon: Clock,
    empty: '최근에 본 작품이 없습니다.',
  },
} as const;

function List({ kind }: { kind: keyof typeof LISTS }) {
  const cfg = LISTS[kind];
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: [kind], queryFn: cfg.queryFn });
  // 최근 본 작품: 전체 삭제 (조회 기록의 짝)
  const clear = useMutation({
    mutationFn: api.market.clearRecent,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recent'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다.'),
  });

  return (
    <div className="page-x mx-auto max-w-page py-6 md:py-10">
      <Breadcrumb items={[{ href: '/my', label: '마이' }, { label: cfg.title }]} />
      <div className="mt-4 mb-6 flex items-end justify-between">
        <h1 className="text-h1">
          {cfg.title} {data && <span className="text-muted">{data.length}</span>}
        </h1>
        {kind === 'recent' && !!data?.length && (
          <Button variant="ghost" size="sm" loading={clear.isPending} onClick={() => clear.mutate()}>
            전체 삭제
          </Button>
        )}
      </div>
      {isPending ? (
        <ProductGridSkeleton />
      ) : data?.length ? (
        <ProductGrid items={data} />
      ) : (
        <EmptyState
          icon={<cfg.Icon />}
          title={`${cfg.title}이 없습니다`}
          description={cfg.empty}
          action={
            <Button asChild variant="outline">
              <Link href="/search">작품 둘러보기</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

export default function MyListPage() {
  const { list } = useParams<{ list: string }>();
  if (!(list in LISTS)) notFound();
  return (
    <RequireAuth>
      <List kind={list as keyof typeof LISTS} />
    </RequireAuth>
  );
}
