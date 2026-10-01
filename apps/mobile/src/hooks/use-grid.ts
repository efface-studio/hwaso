import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme';

/** 카드 한 줄 높이 어림: 4:5 사진 + 작가·제목·가격 + 줄 간격 */
const META_HEIGHT = 80;

/** 화면 폭에 맞춘 그리드 열 수와 카드 폭 (휴대폰 2열 · 폴더블/소형 태블릿 3열 · 아이패드 4~5열) */
export function useGrid(padding = 16, gap = 12) {
  const { width, height } = useWindowDimensions();
  const t = useTheme();
  const base = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const columns = t.senior ? Math.max(1, base - 1) : base;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  // 처음 그릴 줄 수: 한 화면 + 1줄 (FlatList 기본 10줄은 2열 기준 카드 20장 — 첫 화면의 세 배를 한꺼번에 그린다)
  const rows = Math.ceil(height / (cardWidth * 1.25 + META_HEIGHT)) + 1;
  // 렌더링 창: 위아래로 각 3화면만 유지한다 (기본 21화면이면 오래 스크롤할수록 이미지·뷰가 쌓인다)
  const listProps = useMemo(
    () => ({ initialNumToRender: rows, maxToRenderPerBatch: rows, windowSize: 7 }),
    [rows],
  );
  return { columns, cardWidth, padding, gap, listProps };
}
