import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * 채팅 내역이 없을 때 그림: 작은 액자(작품)를 사이에 두고 두 말풍선이 오가는 모습.
 * 테마 색만 써서 라이트·다크 모두 어울린다.
 */
export function ChatEmptyIllustration({ width = 200 }: { width?: number }) {
  const t = useTheme();
  const c = t.colors;
  const wood = t.dark ? '#8A6A4F' : '#B08968';
  return (
    <Svg width={width} height={(width * 160) / 200} viewBox="0 0 200 160" accessibilityRole="image">
      {/* 바닥 */}
      <Path
        d="M30 148 Q100 140 170 148"
        stroke={c.border}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />

      {/* 가운데 액자 */}
      <Rect x={74} y={70} width={52} height={64} rx={3} fill={wood} />
      <Rect x={79} y={75} width={42} height={54} rx={2} fill={c.surface} />
      <Circle cx={108} cy={90} r={6} fill="#F2B84B" />
      <Path d="M79 129 L79 112 Q92 100 102 110 Q112 102 121 110 L121 129 Z" fill={c.primary} />

      {/* 왼쪽 말풍선 (구매자) */}
      <G>
        <Path
          d="M22 20 H70 Q80 20 80 30 V50 Q80 60 70 60 H40 L28 70 V60 H22 Q12 60 12 50 V30 Q12 20 22 20 Z"
          fill={c.primary}
        />
        <Circle cx={32} cy={40} r={3.5} fill={c.primaryForeground} />
        <Circle cx={46} cy={40} r={3.5} fill={c.primaryForeground} />
        <Circle cx={60} cy={40} r={3.5} fill={c.primaryForeground} />
      </G>

      {/* 오른쪽 말풍선 (판매자) */}
      <G>
        <Path
          d="M130 36 H178 Q188 36 188 46 V64 Q188 74 178 74 H176 V84 L164 74 H130 Q120 74 120 64 V46 Q120 36 130 36 Z"
          fill={c.surface2}
          stroke={c.border}
          strokeWidth={1.5}
        />
        <Line x1={132} y1={50} x2={172} y2={50} stroke={c.muted} strokeWidth={3} strokeLinecap="round" />
        <Line
          x1={132}
          y1={60}
          x2={158}
          y2={60}
          stroke={c.muted}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.6}
        />
      </G>

      {/* 반짝임 */}
      <G stroke={c.primary} strokeWidth={2.5} strokeLinecap="round">
        <Line x1={100} y1={18} x2={100} y2={30} />
        <Line x1={94} y1={24} x2={106} y2={24} />
      </G>
    </Svg>
  );
}
