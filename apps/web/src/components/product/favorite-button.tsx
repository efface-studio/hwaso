'use client';

import { ApiError } from '@shop/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

interface FavoriteButtonProps {
  productId: string;
  initial: boolean;
  count?: number;
  variant?: 'overlay' | 'plain';
  className?: string;
}

/**
 * 관심상품 토글. 가격·입찰과 무관한 개인 상태라 낙관적 업데이트 후 실패 시 되돌린다.
 */
export function FavoriteButton({
  productId,
  initial,
  count,
  variant = 'overlay',
  className,
}: FavoriteButtonProps) {
  const [on, setOn] = useState(initial);
  const [n, setN] = useState(count ?? 0);
  const [pending, setPending] = useState(false);
  const [pop, setPop] = useState(false);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (pending) return;
    const next = !on;
    setOn(next);
    setN((v) => v + (next ? 1 : -1));
    if (next) {
      setPop(true);
      setTimeout(() => setPop(false), 160);
    }
    setPending(true);
    try {
      await (next ? api.market.favorite(productId) : api.market.unfavorite(productId));
      if (next) toast.show('관심상품에 저장했어요');
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    } catch (err) {
      setOn(!next);
      setN((v) => v + (next ? -1 : 1));
      toast.error(err instanceof ApiError ? err.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setPending(false);
    }
  };

  const label = on ? '관심상품 해제' : '관심상품 저장';
  const icon = (
    <Heart
      className={cn(
        'size-5 transition-transform duration-150',
        pop && 'scale-115',
        on ? 'fill-destructive text-destructive' : '',
      )}
      strokeWidth={1.75}
      aria-hidden
    />
  );

  if (variant === 'plain') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={label}
        className={cn(
          'inline-flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-sm px-2 hover:bg-surface-2',
          className,
        )}
      >
        {icon}
        {count !== undefined && (
          <span className="tabular text-caption text-muted">{n.toLocaleString('ko-KR')}</span>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        'absolute right-1.5 bottom-1.5 inline-flex size-9 items-center justify-center rounded-full text-foreground/80 hover:text-foreground',
        className,
      )}
    >
      {icon}
    </button>
  );
}
