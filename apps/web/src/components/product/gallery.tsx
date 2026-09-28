'use client';

import type { ImageDto } from '@shop/shared';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/media';
import { MediaImage } from './media-image';

/**
 * 작품 이미지 갤러리. 이미지가 화면의 주인공이므로 가장 크게 보여준다.
 * - 데스크톱: 큰 이미지 + 썸네일
 * - 모바일: 전폭 가로 스와이프 + 번호 표시
 * - 공통: 누르면 전체 화면 확대 보기 (클릭/더블탭 확대, 드래그로 이동, 방향키 이동)
 */
export function Gallery({ images, title }: { images: ImageDto[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState(false);
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
                setViewer(true);
              }}
              aria-label={`${i + 1}번째 이미지 크게 보기`}
              className="relative aspect-square w-full shrink-0 snap-center cursor-zoom-in bg-background-soft md:aspect-[4/5]"
            >
              <MediaImage
                image={img}
                alt={i === 0 ? title : `${title} ${i + 1}`}
                sizes="(min-width: 1024px) 60vw, 100vw"
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

      <ZoomViewer
        open={viewer}
        onOpenChange={setViewer}
        images={images}
        index={index}
        onIndex={goTo}
        title={title}
      />
    </div>
  );
}

interface ZoomViewerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  images: ImageDto[];
  index: number;
  onIndex: (i: number) => void;
  title: string;
}

const ZOOM = 2.5;

function ZoomViewer({ open, onOpenChange, images, index, onIndex, title }: ZoomViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const img = images[index];

  useEffect(() => setZoomed(false), [index, open]);

  const prev = useCallback(
    () => onIndex((index - 1 + images.length) % images.length),
    [index, images.length, onIndex],
  );
  const next = useCallback(() => onIndex((index + 1) % images.length), [index, images.length, onIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, prev, next]);

  const pointFrom = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!zoomed) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: origin.x, oy: origin.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    setOrigin({
      x: clamp(d.ox - ((e.clientX - d.x) / r.width) * 100),
      y: clamp(d.oy - ((e.clientY - d.y) / r.height) * 100),
    });
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    // 거의 움직이지 않았으면 클릭으로 보고 확대/축소 토글
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) {
      if (!zoomed) setOrigin(pointFrom(e));
      setZoomed((z) => !z);
    }
  };

  if (!img) return null;
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Content
          className="fixed inset-0 z-[70] flex flex-col bg-background focus:outline-none data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out"
          aria-describedby={undefined}
        >
          <div className="flex h-14 items-center justify-between px-4">
            <D.Title className="truncate text-label">
              {title}
              <span className="tabular ml-2 text-muted">
                {index + 1} / {images.length}
              </span>
            </D.Title>
            <D.Close className="-m-2 rounded-sm p-2 hover:bg-surface-2" aria-label="닫기">
              <X className="size-6" aria-hidden />
            </D.Close>
          </div>
          <div
            className={cn(
              'relative flex-1 touch-none overflow-hidden select-none',
              zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <img
              src={mediaUrl(img.key, 1600)}
              alt={title}
              draggable={false}
              className="size-full object-contain transition-transform duration-200"
              style={{
                transform: zoomed ? `scale(${ZOOM})` : 'none',
                transformOrigin: `${origin.x}% ${origin.y}%`,
              }}
            />
          </div>
          {images.length > 1 && (
            <div className="flex items-center justify-center gap-6 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={prev}
                aria-label="이전 이미지"
                className="rounded-sm p-3 hover:bg-surface-2"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="다음 이미지"
                className="rounded-sm p-3 hover:bg-surface-2"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
