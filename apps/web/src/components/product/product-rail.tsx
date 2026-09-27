import type { ProductCardDto } from '@shop/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProductCard } from './product-card';

interface SectionProps {
  title: string;
  description?: string;
  href?: string;
  children: ReactNode;
}

export function Section({ title, description, href, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-h2">{title}</h2>
          {description && <p className="mt-0.5 text-small text-muted">{description}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center text-small text-muted hover:text-foreground"
          >
            전체보기
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * 모바일: 가로 스와이프(scroll-snap), 데스크톱: 한 줄 그리드.
 * 데스크톱 축소판이 아니라 모바일 전용 탐색 패턴을 쓴다 (docs/DESIGN_SYSTEM.md §11).
 */
export function ProductRail({ items, priority }: { items: ProductCardDto[]; priority?: boolean }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-6">
      {items.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          priority={priority && i < 2}
          sizes="(min-width: 1024px) 16vw, (min-width: 768px) 25vw, 42vw"
          className="w-[42vw] shrink-0 snap-start md:w-auto"
        />
      ))}
    </div>
  );
}
