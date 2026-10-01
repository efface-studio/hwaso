'use client';

import dynamic from 'next/dynamic';
import { controlClass } from './field';

/**
 * 날짜 선택기(react-day-picker)를 실제로 그릴 때 불러온다 — 판매·채팅 화면의 첫 번들과 링크 미리 받기에서 뺀다.
 * 불러오는 동안은 같은 크기 자리만 잡아 둔다. 쓰는 법은 date-picker 의 DateTimeInput 과 같다.
 */
export const DateTimeInput = dynamic(() => import('./date-picker').then((m) => m.DateTimeInput), {
  ssr: false,
  loading: () => <div className={`${controlClass} h-11`} aria-hidden />,
});
