import { useRef, useState } from 'react';

/** 응답이 아주 빨라도 스켈레톤이 한순간 깜빡이지 않게 최소한 보여줄 시간 */
const MIN_MS = 600;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 당겨서 새로고침. 사용자가 직접 당겼을 때만 refreshing 이 켜진다 — 이때 목록 자리에 스켈레톤을 보여준다.
 * (react-query 의 isRefetching 은 주기 갱신·화면 복귀 재조회에도 켜져서, 보고 있던 내용이 깜빡이게 된다)
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
