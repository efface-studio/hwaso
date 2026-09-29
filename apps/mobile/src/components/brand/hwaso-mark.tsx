import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * 화소 마크 (웹 public/brand/hwaso-mark-*.svg 와 같은 도형, viewBox 180).
 * 네이티브 스플래시 이미지(assets/splash-icon*.png)도 이 도형이라 같은 크기로 그리면 겹쳐 보인다.
 * 두 말풍선을 따로 움직일 수 있게 조각(part)으로도 그린다.
 */
const SQUARE =
  'M48 42 H96 Q110 42 110 56 V90 Q110 104 96 104 H72 L50 124 V104 H48 Q34 104 34 90 V56 Q34 42 48 42 Z';
const CIRCLE = 'M147.4 123 A34 34 0 1 0 132.4 136.8 L152 150 Z';

const COLORS = {
  light: { square: ['#22c574', '#12a45b'], circle: ['#238a5b', '#0c603d', '#07432a'] },
  dark: { square: ['#ffffff', '#e6f2eb'], circle: ['#3fd08a', '#16b364', '#0d8a4a'] },
} as const;

/** 말풍선 중심 (transformOrigin 용, viewBox 기준 비율) */
export const MARK_ORIGIN = { square: '40% 46%', circle: '65.5% 59%' } as const;

export function HwasoMark({ size, part }: { size: number; part?: 'square' | 'circle' }) {
  const t = useTheme();
  const c = COLORS[t.scheme];
  return (
    <Svg width={size} height={size} viewBox="0 0 180 180">
      <Defs>
        <LinearGradient id="sq" gradientUnits="userSpaceOnUse" x1="0" y1="42" x2="0" y2="124">
          <Stop offset="0" stopColor={c.square[0]} />
          <Stop offset="1" stopColor={c.square[1]} />
        </LinearGradient>
        <RadialGradient id="ci" gradientUnits="userSpaceOnUse" cx="118" cy="106" r="54" fx="106" fy="92">
          <Stop offset="0" stopColor={c.circle[0]} />
          <Stop offset="0.45" stopColor={c.circle[1]} />
          <Stop offset="1" stopColor={c.circle[2]} />
        </RadialGradient>
      </Defs>
      {part !== 'circle' && <Path d={SQUARE} fill="url(#sq)" />}
      {part !== 'square' && <Path d={CIRCLE} fill="url(#ci)" />}
    </Svg>
  );
}
