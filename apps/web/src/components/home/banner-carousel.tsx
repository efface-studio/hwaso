'use client';

import type { BannerDto } from '@shop/shared';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaSrcSet, mediaUrl } from '@/lib/media';

const INTERVAL_MS = 6000;

/**
 * 홈 상단 배너. 작품을 가리지 않도록 글은 이미지 옆(모바일은 아래) 단색 영역에 둔다 — 그라디언트·글래스 없음.
 * 스와이프(scroll-snap)·이전/다음·자동 넘김(일시정지 가능, 사용자가 조작하거나 동작 줄이기 설정이면 멈춤).
 */
export function BannerCarousel({ banners }: { banners: BannerDto[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const count = banners.length;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el || count === 0) return;
      const next = (i + count) % count;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
      setIndex(next);
    },
    [count],
  );

  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setInterval(() => go(index + 1), INTERVAL_MS);
    return () => clearInterval(t);
  }, [playing, index, count, go]);

  if (count === 0) return null;

  return (
    <section aria-roledescription="carousel" aria-label="기획전" className="relative">
      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onPointerDown={() => setPlaying(false)}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      >
        {banners.map((b, i) => (
          <Link
            key={b.id}
            href={b.link}
            aria-roledescription="slide"
            className="grid w-full shrink-0 snap-center grid-rows-[auto_auto] bg-background-soft md:h-[360px] md:grid-cols-[2fr_3fr] md:grid-rows-1"
          >
            <div className="order-2 flex flex-col justify-center gap-2 px-4 py-5 md:order-1 md:px-10">
              <p className="text-h1 md:text-display">{b.title}</p>
              {b.subtitle && <p className="text-body text-muted">{b.subtitle}</p>}
              <span className="mt-2 hidden text-label font-semibold underline underline-offset-4 md:inline">
                자세히 보기
              </span>
              {/* 이름은 보이는 글자에서 나오게 두고, 몇 번째 배너인지만 덧붙인다 */}
              <span className="sr-only">
                ({i + 1} / {count})
              </span>
            </div>
            <div className="order-1 aspect-[4/3] md:order-2 md:aspect-auto md:h-[360px]">
              <picture>
                <source
                  type="image/avif"
                  srcSet={mediaSrcSet(b.imageKey, 'avif')}
                  sizes="(min-width: 768px) 60vw, 100vw"
                />
                <img
                  src={mediaUrl(b.imageKey, 1600)}
                  srcSet={mediaSrcSet(b.imageKey)}
                  sizes="(min-width: 768px) 60vw, 100vw"
                  alt=""
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : undefined}
                  className="size-full object-contain p-4 md:p-8"
                />
              </picture>
            </div>
          </Link>
        ))}
      </div>

      {count > 1 && (
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-sm bg-background/90 px-1 md:top-auto md:right-6 md:bottom-6">
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              go(index - 1);
            }}
            aria-label="이전 배너"
            className="p-1.5"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="tabular text-caption" aria-live="polite">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              go(index + 1);
            }}
            aria-label="다음 배너"
            className="p-1.5"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? '자동 넘김 멈춤' : '자동 넘김 재생'}
            className="p-1.5"
          >
            {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          </button>
        </div>
      )}
    </section>
  );
}
