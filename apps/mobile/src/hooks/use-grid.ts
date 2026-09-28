import { useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme';

/** 화면 폭에 맞춘 그리드 열 수와 카드 폭 (휴대폰 2열 · 폴더블/소형 태블릿 3열 · 아이패드 4~5열) */
export function useGrid(padding = 16, gap = 12) {
  const { width } = useWindowDimensions();
  const t = useTheme();
  const base = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const columns = t.senior ? Math.max(1, base - 1) : base;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  return { columns, cardWidth, padding, gap };
}
