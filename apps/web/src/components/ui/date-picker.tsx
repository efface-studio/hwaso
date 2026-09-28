'use client';

import { CalendarDays } from 'lucide-react';
import { Popover as P } from 'radix-ui';
import { useState } from 'react';
import { DayPicker, type Matcher } from 'react-day-picker';
import { ko } from 'react-day-picker/locale';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { controlClass } from './field';
import { Select } from './select';

/**
 * 날짜·시간 입력 (브라우저 기본 date/datetime-local 대신). 값 형식은 기본 입력과 같다:
 * 날짜 = "YYYY-MM-DD", 날짜+시간 = "YYYY-MM-DDTHH:mm", 비어 있으면 "".
 * 캘린더 격자(키보드 탐색·스크린리더 라벨)는 react-day-picker, 모양은 우리 토큰.
 */
interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  mode?: 'datetime' | 'date';
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const DEFAULT_TIME = '12:00';

/** "YYYY-MM-DD[THH:mm]" → 로컬 날짜(자정) + "HH:mm" */
function parse(v: string): { date: Date | null; time: string } {
  const [d, t] = v.split('T');
  const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  return { date, time: t?.slice(0, 5) || DEFAULT_TIME };
}
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function label(date: Date, time: string, withTime: boolean) {
  const day = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEK[date.getDay()]})`;
  if (!withTime) return day;
  const [h, mm] = time.split(':').map(Number) as [number, number];
  return `${day} ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(mm)}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}시` }));
const MINUTES = Array.from({ length: 12 }, (_, i) => ({ value: pad(i * 5), label: `${pad(i * 5)}분` }));

function TimeSelect({ time, onChange }: { time: string; onChange: (t: string) => void }) {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const pm = h >= 12;
  const set = (hour24: number, minute: number) => onChange(`${pad(hour24)}:${pad(minute)}`);
  // 5분 단위가 아닌 기존 값(예: 12:03)도 그대로 보이게 목록에 넣는다
  const minutes = MINUTES.some((o) => Number(o.value) === m)
    ? MINUTES
    : [...MINUTES, { value: pad(m), label: `${pad(m)}분` }].sort((a, b) => Number(a.value) - Number(b.value));
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
      <Select
        size="sm"
        aria-label="오전·오후"
        value={pm ? 'pm' : 'am'}
        onValueChange={(v) => set((h % 12) + (v === 'pm' ? 12 : 0), m)}
        options={[
          { value: 'am', label: '오전' },
          { value: 'pm', label: '오후' },
        ]}
      />
      <Select
        size="sm"
        aria-label="시"
        value={String(h % 12 || 12)}
        onValueChange={(v) => set((Number(v) % 12) + (pm ? 12 : 0), m)}
        options={HOURS}
      />
      <Select
        size="sm"
        aria-label="분"
        value={pad(m)}
        onValueChange={(v) => set(h, Number(v))}
        options={minutes}
      />
    </div>
  );
}

export function DateTimeInput({
  value,
  onChange,
  mode = 'datetime',
  min,
  max,
  placeholder,
  disabled,
  ...aria
}: DateTimeInputProps) {
  const [open, setOpen] = useState(false);
  const withTime = mode === 'datetime';
  const { date, time } = parse(value);
  const commit = (d: Date, t: string) => onChange(withTime ? `${toDay(d)}T${t}` : toDay(d));
  const bounds: Matcher[] = [];
  const minDate = min ? parse(min).date : null;
  const maxDate = max ? parse(max).date : null;
  if (minDate) bounds.push({ before: minDate });
  if (maxDate) bounds.push({ after: maxDate });
  const valueId = aria.id ? `${aria.id}-value` : undefined;
  const describedBy = [valueId, aria['aria-describedby']].filter(Boolean).join(' ') || undefined;

  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={aria.id}
          aria-describedby={describedBy}
          aria-invalid={aria['aria-invalid']}
          className={cn(controlClass, 'inline-flex h-11 items-center justify-between gap-2 text-left')}
        >
          {/* 라벨이 이름이 되므로 현재 값은 설명으로 읽힌다 */}
          <span id={valueId} className={cn('truncate', !date && 'text-faint')}>
            {date
              ? label(date, time, withTime)
              : (placeholder ?? (withTime ? '날짜와 시간 선택' : '날짜 선택'))}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="start"
          sideOffset={6}
          // 열리면 이전 달 버튼이 아니라 선택된(없으면 오늘) 날짜에 초점 — 화살표 키로 바로 이동
          onOpenAutoFocus={(e) => e.preventDefault()}
          collisionPadding={12}
          className="z-50 w-[min(calc(100vw-24px),320px)] origin-(--radix-popover-content-transform-origin) rounded-md border border-border bg-surface p-3 shadow-md focus:outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <DayPicker
            mode="single"
            autoFocus
            locale={ko}
            selected={date ?? undefined}
            defaultMonth={date ?? minDate ?? undefined}
            onSelect={(d) => {
              if (!d) return;
              commit(d, time);
              if (!withTime) setOpen(false);
            }}
            disabled={bounds}
            showOutsideDays
            classNames={{
              root: 'text-small',
              months: 'relative',
              month_caption: 'flex h-9 items-center justify-center text-body-strong',
              nav: 'absolute inset-x-0 top-0 flex justify-between',
              button_previous:
                'inline-flex size-9 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-30',
              button_next:
                'inline-flex size-9 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-30',
              chevron: 'size-4 fill-current',
              month_grid: 'mt-2 w-full border-collapse',
              weekday: 'h-8 text-caption font-medium text-muted',
              day: 'p-0.5 text-center',
              day_button:
                'tabular mx-auto flex size-9 items-center justify-center rounded-full hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring',
              selected:
                '[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
              today: '[&>button]:font-bold [&>button]:text-primary',
              outside: 'text-faint',
              disabled: 'opacity-30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
            }}
          />
          {withTime && (
            <div className="mt-3 border-t border-border pt-3">
              <TimeSelect time={time} onChange={(t) => commit(date ?? minDate ?? new Date(), t)} />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => commit(new Date(), time)}>
                오늘
              </Button>
              {value && (
                <Button size="sm" variant="ghost" onClick={() => onChange('')}>
                  지우기
                </Button>
              )}
            </div>
            <Button size="sm" onClick={() => setOpen(false)}>
              완료
            </Button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
