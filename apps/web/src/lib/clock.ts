'use client';

import { useSyncExternalStore } from 'react';
import { api } from './api';

/**
 * 서버 시간 기준 시계 (docs/AUCTION.md §9). 클라이언트 로컬 시계를 믿지 않는다.
 * offset = serverTime - (요청 시각 + RTT/2). 모든 카운트다운이 하나의 1초 타이머를 공유한다.
 */
let offset = 0;
let synced = false;
let syncing: Promise<void> | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

export function syncServerTime(): Promise<void> {
  syncing ??= (async () => {
    const start = Date.now();
    try {
      const { serverTime } = await api.time();
      const end = Date.now();
      offset = Date.parse(serverTime) - (start + (end - start) / 2);
      synced = true;
    } catch {
      // 동기화 실패 시 마지막 offset 을 유지한다
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export const serverNow = () => Date.now() + offset;
export const isClockSynced = () => synced;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    void syncServerTime();
    now = serverNow();
    timer = setInterval(() => {
      now = serverNow();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

if (typeof window !== 'undefined') {
  // 탭 복귀 시 재동기화 (절전/백그라운드 동안 시계가 어긋날 수 있다)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncServerTime();
  });
  setInterval(() => void syncServerTime(), 30_000);
}

/** 1초마다 갱신되는 서버 기준 현재 시각(ms). SSR 에서는 null */
export function useServerNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
}
