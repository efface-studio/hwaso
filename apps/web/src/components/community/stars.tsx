'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'size-3.5' : 'size-5';
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(s, n <= Math.round(value) ? 'fill-foreground text-foreground' : 'text-border-strong')}
        />
      ))}
    </span>
  );
}

/** 별점 입력: 라디오 그룹 (키보드 좌우로 조절) */
export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="별점" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          onClick={() => onChange(n)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(5, value + 1));
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(1, value - 1));
          }}
          className="p-1"
        >
          <Star
            className={cn('size-8', n <= value ? 'fill-foreground text-foreground' : 'text-border-strong')}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}
