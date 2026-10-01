import { ProfileFollow } from '@/components/community/profile-follow';
import { ReviewList } from '@/components/community/review-list';
import { ProfileMenu } from '@/components/safety/profile-menu';
import { ApiError } from '@shop/api-client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/product/product-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge, EmptyState } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import { safe, serverApi } from '@/lib/server-api';

export const revalidate = 60;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const u = await safe(serverApi.market.user(id));
  return u
    ? {
        title: `${u.nickname}님의 프로필`,
        description: u.bio || `${u.nickname}님이 판매 중인 작품`,
        alternates: { canonical: `/users/${id}` },
      }
    : { title: '프로필' };
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="tabular text-body-strong">
        {href ? (
          <Link href={href} className="hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default async function UserPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === 'sold' || rawTab === 'reviews' ? rawTab : 'selling';
  // 작품 목록은 프로필과 함께 요청한다 (404 판단은 프로필 결과로)
  const itemsP = tab === 'reviews' ? null : safe(serverApi.market.userProducts(id, tab));
  let u;
  try {
    u = await serverApi.market.user(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    return <EmptyState title="프로필을 불러오지 못했습니다" description="잠시 후 다시 시도해주세요." />;
  }
  const items = (await itemsP) ?? [];

  return (
    <div className="page-x mx-auto max-w-page py-6 md:py-10">
      <header className="flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar avatarKey={u.avatarKey} name={u.nickname} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-h1">
              {u.nickname}
              {u.verified && <Badge tone="primary">인증 판매자</Badge>}
            </h1>
            <p className="text-small text-muted">
              {[u.region, `${new Date(u.joinedAt).getFullYear()}년 가입`].filter(Boolean).join(' · ')}
            </p>
            {u.bio && <p className="mt-1 max-w-xl text-body">{u.bio}</p>}
          </div>
          <ProfileFollow userId={u.id} initial={u.isFollowing} followsMe={u.followsMe} />
          <ProfileMenu userId={u.id} nickname={u.nickname} />
        </div>
        <dl className="flex gap-6">
          <Stat label="거래" value={u.tradeCount.toLocaleString('ko-KR')} />
          <Stat label="평점" value={`${u.ratingAvg.toFixed(1)} (${u.ratingCount})`} />
          <Stat label="팔로워" value={u.followerCount} href={`/users/${id}/followers`} />
          <Stat label="팔로잉" value={u.followingCount} href={`/users/${id}/following`} />
        </dl>
      </header>

      <nav aria-label="프로필 탭" className="mt-2 flex gap-6 border-b border-border">
        {(
          [
            ['selling', `판매 중 ${u.sellingCount}`],
            ['sold', `판매 완료 ${u.soldCount}`],
            ['reviews', `후기 ${u.ratingCount}`],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === 'selling' ? `/users/${id}` : `/users/${id}?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              '-mb-px flex h-11 items-center border-b-2 text-label',
              tab === key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'reviews' ? (
          <ReviewList userId={id} />
        ) : items.length ? (
          <ProductGrid items={items} priorityCount={4} />
        ) : (
          <EmptyState title={tab === 'sold' ? '판매 완료된 작품이 없습니다' : '판매 중인 작품이 없습니다'} />
        )}
      </div>
    </div>
  );
}
