'use client';

import type { ImageDto } from '@shop/shared';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/media';

interface ZoomViewerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  images: ImageDto[];
  index: number;
  onIndex: (i: number) => void;
  title: string;
}

const ZOOM = 2.5;

/** 전체 화면 확대 보기: 클릭/더블탭 확대, 드래그로 이동, 방향키 이동 (gallery 가 처음 열 때 불러온다) */
export function ZoomViewer({ open, onOpenChange, images, index, onIndex, title }: ZoomViewerProps) {
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
