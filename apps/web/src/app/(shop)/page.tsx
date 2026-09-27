import { ImageOff } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/display';
import { NAV_CATEGORIES } from '@/lib/categories';

// 홈 섹션(인기 상품·오늘의 경매·마감 임박·신규 등록·인기 작가)은 마켓플레이스 API 연결 시 채운다.
export default function HomePage() {
  return (
    <div className="page-x mx-auto max-w-page py-8">
      <section aria-labelledby="home-categories">
        <h2 id="home-categories" className="text-h2">
          카테고리
        </h2>
        <ul className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6 lg:grid-cols-11">
          {NAV_CATEGORIES.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="flex h-12 items-center justify-center rounded-sm border border-border text-label hover:border-foreground"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <EmptyState
        className="mt-10"
        icon={<ImageOff />}
        title="아직 등록된 작품이 없습니다"
        description="첫 작품을 등록해 보세요."
        action={
          <Link href="/sell" className="text-label font-semibold text-primary hover:underline">
            작품 등록하기
          </Link>
        }
      />
    </div>
  );
}
