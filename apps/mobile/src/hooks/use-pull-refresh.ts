import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { keepFirstPage } from '@/lib/infinite';

/** 응답이 아주 빨라도 새로고침 표시(스피너)가 한순간 깜빡이지 않게 최소한 보여줄 시간 */
const MIN_MS = 600;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 당겨서 새로고침. 사용자가 직접 당겼을 때만 refreshing 이 켜진다 — 보던 내용은 그대로 두고 스피너만 보여준다
 * (목록을 비우고 스켈레톤으로 바꾸면 목록이 통째로 다시 그려진다. 스켈레톤은 처음 불러올 때만).
 * react-query 의 isRefetching 은 주기 갱신·화면 복귀 재조회에도 켜져서 쓰지 않는다.
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  // 진행 중에 다시 당기거나(바운스 중 재호출 포함) 겹쳐 불리면 무시한다
  const running = useRef(false);
  const onRefresh = async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    try {
      await Promise.all([refetch(), wait(MIN_MS)]);
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  };
  return { refreshing, onRefresh: () => void onRefresh() };
}

/** 무한 목록의 당겨서 새로고침 — 맨 위에서 당기므로 첫 페이지만 다시 불러온다 (쌓인 페이지를 차례로 모두 부르지 않게) */
export function useInfinitePullRefresh(queryKey: QueryKey, refetch: () => Promise<unknown>) {
  const qc = useQueryClient();
  return usePullRefresh(() => {
    keepFirstPage(qc, queryKey);
    return refetch();
  });
}
