import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * 판매자 등록 안내 그림: 이젤 위 액자(작품)에 가격표가 걸려 있고, 화소 말풍선 마크가 떠 있다.
 * 테마 색만 써서 라이트·다크 모두 어울린다.
 */
export function SellOnboardingIllustration({ width = 240 }: { width?: number }) {
  const t = useTheme();
  const c = t.colors;
  const wood = t.dark ? '#8A6A4F' : '#B08968';
  return (
    <Svg width={width} height={(width * 200) / 240} viewBox="0 0 240 200" accessibilityRole="image">
      {/* 바닥 그림자 */}
      <Path
        d="M44 186 Q120 176 196 186"
        stroke={c.border}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />

      {/* 이젤 다리 */}
      <G stroke={wood} strokeWidth={5} strokeLinecap="round">
        <Line x1={92} y1={60} x2={64} y2={184} />
        <Line x1={148} y1={60} x2={176} y2={184} />
        <Line x1={120} y1={40} x2={120} y2={178} />
        <Line x1={74} y1={150} x2={166} y2={150} />
      </G>

      {/* 액자 */}
      <Rect x={62} y={34} width={116} height={92} rx={4} fill={wood} />
      <Rect x={69} y={41} width={102} height={78} rx={2} fill={c.surface} />
      {/* 작품: 해·언덕 */}
      <Circle cx={146} cy={62} r={10} fill="#F2B84B" />
      <Path
        d="M69 119 L69 98 Q92 76 112 96 Q128 84 146 98 Q160 90 171 100 L171 119 Z"
        fill={c.primary}
        opacity={0.85}
      />
      <Path d="M69 119 L69 108 Q96 96 120 110 Q146 100 171 110 L171 119 Z" fill={c.primary} />

      {/* 가격표 */}
      <G>
        <Line x1={168} y1={44} x2={188} y2={72} stroke={c.muted} strokeWidth={1.5} />
        <Path d="M180 70 L206 70 L214 82 L206 94 L180 94 Z" fill={c.foreground} />
        <Circle cx={186} cy={82} r={2.5} fill={c.background} />
        <Line x1={193} y1={79} x2={206} y2={79} stroke={c.background} strokeWidth={2} strokeLinecap="round" />
        <Line x1={193} y1={85} x2={202} y2={85} stroke={c.background} strokeWidth={2} strokeLinecap="round" />
      </G>

      {/* 화소 말풍선 마크 */}
      <G transform="translate(18 10) scale(0.36)">
        <Path
          d="M48 42 H96 Q110 42 110 56 V90 Q110 104 96 104 H72 L50 124 V104 H48 Q34 104 34 90 V56 Q34 42 48 42 Z"
          fill={c.primary}
          opacity={0.9}
        />
        <Path d="M147.4 123 A34 34 0 1 0 132.4 136.8 L152 150 Z" fill={c.foreground} opacity={0.85} />
      </G>

      {/* 반짝임 */}
      <G stroke={c.primary} strokeWidth={2.5} strokeLinecap="round">
        <Line x1={206} y1={24} x2={206} y2={36} />
        <Line x1={200} y1={30} x2={212} y2={30} />
        <Line x1={30} y1={120} x2={30} y2={128} />
        <Line x1={26} y1={124} x2={34} y2={124} />
      </G>
    </Svg>
  );
}
