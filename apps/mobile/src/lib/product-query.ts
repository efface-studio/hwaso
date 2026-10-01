import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Dimensions } from 'react-native';
import { READABLE_WIDTH, SPLIT_MIN_WIDTH } from '@/hooks/use-layout';
import { api } from './api';
import { imageWidthFor, mediaUrl } from './media';

/** 작품 상세 — 상세 화면과 카드의 미리 불러오기가 같은 키·함수를 쓴다 */
export const productQuery = (id: string) =>
  queryOptions({ queryKey: ['product', id], queryFn: () => api.market.product(id) });

/** 상세 사진 폭: 화면 폭, 태블릿에서는 본문 폭까지 (두 칸 배치는 왼쪽 칸 크기를 따로 받는다) */
export const galleryWidth = (screen: number) => Math.min(screen, READABLE_WIDTH);

/**
 * 카드를 누르기 시작할 때 상세 정보를 먼저 요청한다 (손가락을 떼고 화면이 넘어가는 동안 받는다).
 * 신선한 캐시(staleTime)가 있으면 다시 받지 않는다.
 */
export function prefetchProduct(qc: QueryClient, id: string) {
  void qc.prefetchQuery(productQuery(id));
}

/**
 * 상세로 넘어갈 때 첫 사진을 상세 화면 크기로 미리 받는다 — 상세 정보가 오기 전에 사진 내려받기를 시작한다.
 * 두 칸 배치(넓은 화면)는 칸 크기를 그려 봐야 알 수 있어 건너뛴다.
 */
export function prefetchCover(key: string) {
  const { width } = Dimensions.get('window');
  if (width >= SPLIT_MIN_WIDTH) return;
  void Image.prefetch(mediaUrl(key, imageWidthFor(galleryWidth(width))), 'memory-disk').catch(
    () => undefined,
  );
}
