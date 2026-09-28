import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { api } from './api';

/**
 * 서버 기준 시계 (docs/AUCTION.md §9) — 기기 시계를 믿지 않는다.
 * offset = serverTime - (요청 시각 + RTT/2). 모든 카운트다운이 하나의 1초 타이머를 공유한다.
 */
let offset = 0;
let syncing: Promise<void> | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

export function syncServerTime(): Promise<void> {
  syncing ??= (async () => {
    const start = Date.now();
    try {
      const { serverTime } = await api.time();
      offset = Date.parse(serverTime) - (start + (Date.now() - start) / 2);
    } catch {
      // 실패하면 마지막 offset 을 유지한다
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export const serverNow = () => Date.now() + offset;

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

// 앱이 백그라운드에서 돌아오면 다시 맞춘다 (절전 중 시계가 어긋날 수 있다)
AppState.addEventListener('change', (s) => {
  if (s === 'active') void syncServerTime();
});

/** 1초마다 갱신되는 서버 기준 현재 시각(ms) */
export function useServerNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}
