'use client';

import { formatRemaining } from '@shop/shared';
import { cn } from '@/lib/cn';
import { useServerNow } from '@/lib/clock';

const HOUR = 3_600_000;

interface CountdownProps {
  /** ISO. 서버가 준 값만 사용한다 */
  endsAt: string;
  startsAt?: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'SETTLED' | 'CANCELLED' | 'DRAFT';
  className?: string;
  /** 짧은 표기 (카드용) */
  compact?: boolean;
}

/**
 * 서버 시간 기준 남은 시간. 0 이 되어도 종료를 선언하지 않고 "종료 처리 중" 을 보여준다 —
 * 종료 확정은 서버 이벤트/재조회로만 한다 (docs/AUCTION.md §9).
 */
export function AuctionCountdown({ endsAt, startsAt, status, className, compact }: CountdownProps) {
  const now = useServerNow();
  if (status === 'ENDED' || status === 'SETTLED')
    return <span className={cn('text-muted', className)}>종료</span>;
  if (status === 'CANCELLED') return <span className={cn('text-muted', className)}>취소됨</span>;

  const target = status === 'SCHEDULED' && startsAt ? startsAt : endsAt;
  if (now == null) {
    // SSR·하이드레이션 직후: 레이아웃이 흔들리지 않게 자리만 잡는다
    return <span className={cn('tabular invisible', className)}>00:00:00</span>;
  }
  const remaining = Date.parse(target) - now;
  if (remaining <= 0) {
    return (
      <span className={cn('text-muted', className)}>
        {status === 'SCHEDULED' ? '곧 시작' : '종료 처리 중'}
      </span>
    );
  }
  const urgent = status === 'LIVE' && remaining < HOUR;
  const text = formatRemaining(remaining);
  return (
    <span
      className={cn('tabular', urgent ? 'text-destructive' : 'text-foreground', className)}
      aria-label={`${status === 'SCHEDULED' ? '시작까지' : '종료까지'} ${text}`}
    >
      {compact ? null : (
        <span className="mr-1 text-muted">{status === 'SCHEDULED' ? '시작까지' : '남은 시간'}</span>
      )}
      {text}
    </span>
  );
}
