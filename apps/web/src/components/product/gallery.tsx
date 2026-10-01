'use client';

import type { ImageDto } from '@shop/shared';
import { ZoomIn } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { MediaImage } from './media-image';

/** 전체 화면 확대 보기(Radix Dialog)는 처음 누를 때 불러온다 — 상세 화면 첫 번들에서 뺀다 */
const loadViewer = () => import('./zoom-viewer');
const ZoomViewer = dynamic(() => loadViewer().then((m) => m.ZoomViewer), { ssr: false });

/**
 * 작품 이미지 갤러리. 이미지가 화면의 주인공이므로 가장 크게 보여준다.
 * - 데스크톱: 큰 이미지 + 썸네일
 * - 모바일: 전폭 가로 스와이프 + 번호 표시
 * - 공통: 누르면 전체 화면 확대 보기 (클릭/더블탭 확대, 드래그로 이동, 방향키 이동)
 */
export function Gallery({ images, title }: { images: ImageDto[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState(false);
  // 한 번 연 뒤에는 계속 마운트해 둔다 (닫힘 애니메이션 유지)
  const [viewerMounted, setViewerMounted] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i: number) => {
    setIndex(i);
    track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: 'smooth' });
  };

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-background-soft" role="img" aria-label={`${title} 이미지 없음`} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:overflow-hidden"
          aria-roledescription="carousel"
          aria-label={`${title} 이미지`}
        >
          {images.map((img, i) => (
            <button
              key={img.key}
              type="button"
              onClick={() => {
                setIndex(i);
                setViewerMounted(true);
                setViewer(true);
              }}
              // 누르기 전에 미리 받아 둔다
              onPointerEnter={() => void loadViewer()}
              onFocus={() => void loadViewer()}
              aria-label={`${i + 1}번째 이미지 크게 보기`}
              className="relative aspect-square w-full shrink-0 snap-center cursor-zoom-in bg-background-soft md:aspect-[4/5]"
            >
              <MediaImage
                image={img}
                alt={i === 0 ? title : `${title} ${i + 1}`}
                // 왼쪽 칸은 페이지 폭(최대 1280)의 약 3/5 — 넓은 화면에서 vw 로만 두면 필요 이상 큰 파생본을 고른다
                sizes="(min-width: 1280px) 700px, (min-width: 768px) 60vw, 100vw"
                priority={i === 0}
                className="p-4 md:p-10"
              />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <span className="tabular pointer-events-none absolute right-3 bottom-3 rounded-sm bg-background/80 px-2 py-0.5 text-caption md:hidden">
            {index + 1} / {images.length}
          </span>
        )}
        <span className="pointer-events-none absolute right-3 bottom-3 hidden items-center gap-1 rounded-sm bg-background/80 px-2 py-1 text-caption text-muted md:inline-flex">
          <ZoomIn className="size-3.5" aria-hidden />
          눌러서 확대
        </span>
      </div>

      {images.length > 1 && (
        <ul className="hidden gap-2 md:flex" aria-label="이미지 선택">
          {images.map((img, i) => (
            <li key={img.key}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`${i + 1}번째 이미지`}
                aria-current={i === index}
                className={cn(
                  'size-16 overflow-hidden border bg-background-soft',
                  i === index ? 'border-foreground' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <MediaImage image={img} alt="" sizes="64px" className="p-1" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewerMounted && (
        <ZoomViewer
          open={viewer}
          onOpenChange={setViewer}
          images={images}
          index={index}
          onIndex={goTo}
          title={title}
        />
      )}
    </div>
  );
}
