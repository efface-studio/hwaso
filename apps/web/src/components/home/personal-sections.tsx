'use client';

import { useQuery } from '@tanstack/react-query';
import { ProductRail, Section } from '@/components/product/product-rail';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/** 로그인 사용자 전용 섹션 — 서버 캐시(ISR) 대상이 아니므로 클라이언트에서 조회한다 */
export function PersonalSections() {
  const user = useAuthStore((s) => s.user);
  const recent = useQuery({ queryKey: ['recent'], queryFn: api.market.recent, enabled: !!user });
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: api.market.favorites, enabled: !!user });
  const feed = useQuery({
    queryKey: ['following-feed', 'home'],
    queryFn: () => api.community.feed(),
    enabled: !!user,
  });
  if (!user) return null;
  return (
    <>
      {!!feed.data?.items.length && (
        <Section title="팔로우한 판매자의 새 작품" href="/my/following">
          <ProductRail items={feed.data.items.slice(0, 12)} />
        </Section>
      )}
      {!!recent.data?.length && (
        <Section title="최근 본 작품" href="/my/recent">
          <ProductRail items={recent.data.slice(0, 12)} />
        </Section>
      )}
      {!!favorites.data?.length && (
        <Section
          title="관심 작품"
          description="가격이 바뀌거나 경매가 시작되면 알려드려요"
          href="/my/favorites"
        >
          <ProductRail items={favorites.data.slice(0, 12)} />
        </Section>
      )}
    </>
  );
}
