import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * 무한 목록을 첫 페이지만 남긴다. react-query 는 무한 목록을 다시 불러올 때 쌓인 페이지를 처음부터 차례로 모두 부르므로,
 * 맨 위에서 새로고침할 때는 먼저 줄여 요청 한 번으로 끝낸다 (아래 페이지는 스크롤하면 다시 불러온다).
 */
export function keepFirstPage(qc: QueryClient, queryKey: QueryKey) {
  const d = qc.getQueryData<InfiniteData<unknown>>(queryKey);
  if (!d || d.pages.length <= 1) return;
  qc.setQueryData<InfiniteData<unknown>>(
    queryKey,
    { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) },
    // 받은 시각은 그대로 둔다 (줄이기만 했지 새로 받은 데이터가 아니다)
    { updatedAt: qc.getQueryState(queryKey)?.dataUpdatedAt },
  );
}
