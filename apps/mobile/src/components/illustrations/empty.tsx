import type { ReactNode } from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useTheme, type Theme } from '@/theme';
import { ChatEmptyIllustration } from './chat-empty';

/** 빈 상태 그림 종류 */
export type EmptyKind =
  | 'generic'
  | 'cart'
  | 'search'
  | 'heart'
  | 'bell'
  | 'box'
  | 'pin'
  | 'lock'
  | 'error'
  | 'notfound'
  | 'chat'
  | 'people'
  | 'gavel'
  | 'doc';

type C = Theme['colors'];

/** 모든 그림의 바닥 그림자 */
const floor = (c: C) => (
  <Path d="M40 148 Q100 140 160 148" stroke={c.border} strokeWidth={3} strokeLinecap="round" fill="none" />
);

/** 반짝임 (화소 그림 공통 포인트) */
const sparkle = (c: C, x: number, y: number) => (
  <G stroke={c.primary} strokeWidth={2.5} strokeLinecap="round">
    <Line x1={x} y1={y - 6} x2={x} y2={y + 6} />
    <Line x1={x - 6} y1={y} x2={x + 6} y2={y} />
  </G>
);

/** 작은 액자 (작품) — 여러 그림에서 소품으로 쓴다 */
const frame = (c: C, wood: string, x: number, y: number, w: number, h: number, art = true) => (
  <G>
    <Rect x={x} y={y} width={w} height={h} rx={3} fill={wood} />
    <Rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx={2} fill={c.surface} />
    {art && (
      <>
        <Circle cx={x + w - 16} cy={y + 18} r={5} fill="#F2B84B" />
        <Path
          d={`M${x + 5} ${y + h - 5} L${x + 5} ${y + h - 18} Q${x + w * 0.35} ${y + h - 32} ${x + w * 0.55} ${y + h - 20} Q${x + w * 0.75} ${y + h - 28} ${x + w - 5} ${y + h - 18} L${x + w - 5} ${y + h - 5} Z`}
          fill={c.primary}
        />
      </>
    )}
  </G>
);

function draw(kind: Exclude<EmptyKind, 'chat'>, c: C, wood: string): ReactNode {
  switch (kind) {
    case 'cart':
      return (
        <>
          {/* 쇼핑백 + 화소 태그 */}
          <Path d="M62 58 H138 L146 140 H54 Z" fill={c.surface2} stroke={c.border} strokeWidth={1.5} />
          <Path
            d="M80 58 V46 Q80 28 100 28 Q120 28 120 46 V58"
            stroke={c.muted}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
          />
          <Rect x={82} y={82} width={36} height={30} rx={4} fill={c.primary} />
          <Circle cx={92} cy={97} r={3} fill={c.primaryForeground} />
          <Line
            x1={100}
            y1={93}
            x2={112}
            y2={93}
            stroke={c.primaryForeground}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Line
            x1={100}
            y1={101}
            x2={108}
            y2={101}
            stroke={c.primaryForeground}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {sparkle(c, 158, 44)}
        </>
      );
    case 'search':
      return (
        <>
          {frame(c, wood, 48, 40, 70, 90)}
          {/* 돋보기 */}
          <Circle
            cx={128}
            cy={82}
            r={26}
            fill={c.background}
            fillOpacity={0.6}
            stroke={c.foreground}
            strokeWidth={6}
          />
          <Line
            x1={147}
            y1={101}
            x2={168}
            y2={124}
            stroke={c.foreground}
            strokeWidth={9}
            strokeLinecap="round"
          />
          <Path
            d="M116 76 Q120 68 130 66"
            stroke={c.muted}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
          {sparkle(c, 40, 30)}
        </>
      );
    case 'heart':
      return (
        <>
          {frame(c, wood, 56, 36, 88, 104, false)}
          <Path
            d="M100 118 C78 102 70 90 70 80 C70 70 78 64 86 64 C92 64 97 68 100 73 C103 68 108 64 114 64 C122 64 130 70 130 80 C130 90 122 102 100 118 Z"
            fill={c.primary}
          />
          {sparkle(c, 160, 40)}
        </>
      );
    case 'bell':
      return (
        <>
          <Path
            d="M100 34 C80 34 70 50 70 70 V96 L60 112 H140 L130 96 V70 C130 50 120 34 100 34 Z"
            fill={c.surface2}
            stroke={c.border}
            strokeWidth={1.5}
          />
          <Circle cx={100} cy={30} r={5} fill={c.muted} />
          <Path d="M88 116 Q100 132 112 116" fill={c.primary} />
          {/* 조용함 zZ */}
          <Path
            d="M142 40 H154 L142 54 H154"
            stroke={c.primary}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M160 24 H168 L160 33 H168"
            stroke={c.primary}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'box':
      return (
        <>
          {/* 소포 상자 */}
          <Path
            d="M100 44 L148 64 V120 L100 140 L52 120 V64 Z"
            fill={c.surface2}
            stroke={c.border}
            strokeWidth={1.5}
          />
          <Path d="M52 64 L100 84 L148 64" stroke={c.border} strokeWidth={1.5} fill="none" />
          <Line x1={100} y1={84} x2={100} y2={140} stroke={c.border} strokeWidth={1.5} />
          <Path d="M76 54 L124 74 V90 L116 86 L108 92 V78 L60 58 Z" fill={c.primary} />
          {sparkle(c, 160, 40)}
        </>
      );
    case 'pin':
      return (
        <>
          {/* 지도 + 위치 핀 */}
          <Path
            d="M40 70 L76 58 L124 74 L160 62 V128 L124 140 L76 124 L40 136 Z"
            fill={c.surface2}
            stroke={c.border}
            strokeWidth={1.5}
          />
          <Line x1={76} y1={58} x2={76} y2={124} stroke={c.border} strokeWidth={1.5} />
          <Line x1={124} y1={74} x2={124} y2={140} stroke={c.border} strokeWidth={1.5} />
          <Path
            d="M100 104 C88 88 82 80 82 70 C82 60 90 52 100 52 C110 52 118 60 118 70 C118 80 112 88 100 104 Z"
            fill={c.primary}
          />
          <Circle cx={100} cy={70} r={6} fill={c.primaryForeground} />
        </>
      );
    case 'lock':
      return (
        <>
          <Path
            d="M78 70 V56 Q78 34 100 34 Q122 34 122 56 V70"
            stroke={c.muted}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
          <Rect x={64} y={68} width={72} height={64} rx={10} fill={c.primary} />
          <Circle cx={100} cy={94} r={8} fill={c.primaryForeground} />
          <Rect x={97} y={98} width={6} height={16} rx={3} fill={c.primaryForeground} />
          {sparkle(c, 154, 44)}
        </>
      );
    case 'error':
      return (
        <>
          {/* 기울어진 액자 + 끊긴 구름 */}
          <G transform="rotate(-8 100 96)">{frame(c, wood, 62, 62, 76, 70, false)}</G>
          <Path
            d="M88 86 L104 100 M104 86 L88 100"
            stroke={c.destructive}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Path
            d="M122 50 Q122 36 136 36 Q144 26 156 32 Q170 32 170 46 Q176 50 172 58 H126 Q118 56 122 50 Z"
            fill={c.surface2}
            stroke={c.border}
            strokeWidth={1.5}
          />
          <Line x1={140} y1={42} x2={154} y2={54} stroke={c.muted} strokeWidth={2.5} strokeLinecap="round" />
        </>
      );
    case 'notfound':
      return (
        <>
          {frame(c, wood, 58, 34, 84, 104, false)}
          <Path
            d="M88 72 Q88 58 100 58 Q112 58 112 70 Q112 78 104 82 Q100 84 100 92"
            stroke={c.primary}
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx={100} cy={106} r={4} fill={c.primary} />
          {sparkle(c, 158, 38)}
        </>
      );
    case 'people':
      return (
        <>
          <Circle cx={80} cy={66} r={16} fill={c.surface2} stroke={c.border} strokeWidth={1.5} />
          <Path
            d="M50 128 Q50 94 80 94 Q110 94 110 128 Z"
            fill={c.surface2}
            stroke={c.border}
            strokeWidth={1.5}
          />
          <Circle cx={122} cy={60} r={18} fill={c.primary} />
          <Path d="M88 130 Q88 90 122 90 Q156 90 156 130 Z" fill={c.primary} />
          {sparkle(c, 160, 36)}
        </>
      );
    case 'gavel':
      return (
        <>
          {/* 경매 망치 + 받침 */}
          <G transform="rotate(-30 100 80)">
            <Rect x={72} y={50} width={56} height={24} rx={6} fill={c.primary} />
            <Rect x={96} y={74} width={8} height={56} rx={4} fill={c.muted} />
          </G>
          <Rect
            x={62}
            y={128}
            width={76}
            height={12}
            rx={4}
            fill={c.surface2}
            stroke={c.border}
            strokeWidth={1.5}
          />
          {sparkle(c, 150, 40)}
        </>
      );
    case 'doc':
      return (
        <>
          <Path d="M66 30 H120 L140 50 V140 H66 Z" fill={c.surface2} stroke={c.border} strokeWidth={1.5} />
          <Path d="M120 30 V50 H140" fill="none" stroke={c.border} strokeWidth={1.5} />
          {[66, 80, 94].map((y, i) => (
            <Line
              key={y}
              x1={80}
              y1={y}
              x2={i === 2 ? 110 : 126}
              y2={y}
              stroke={c.muted}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
          <Circle cx={124} cy={118} r={14} fill={c.primary} />
          <Path
            d="M117 118 L122 123 L131 113"
            stroke={c.primaryForeground}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'generic':
      return (
        <>
          {/* 비어 있는 이젤 */}
          <G stroke={wood} strokeWidth={5} strokeLinecap="round">
            <Line x1={82} y1={60} x2={62} y2={144} />
            <Line x1={118} y1={60} x2={138} y2={144} />
            <Line x1={70} y1={118} x2={130} y2={118} />
          </G>
          <Rect x={62} y={36} width={76} height={62} rx={3} fill={wood} />
          <Rect x={67} y={41} width={66} height={52} rx={2} fill={c.surface} />
          <Rect
            x={73}
            y={47}
            width={54}
            height={40}
            rx={2}
            fill="none"
            stroke={c.border}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
          {sparkle(c, 154, 40)}
        </>
      );
  }
}

/** 빈 상태 그림 (테마 색만 써서 라이트·다크 모두 어울린다) */
export function EmptyIllustration({ kind, width = 180 }: { kind: EmptyKind; width?: number }) {
  const t = useTheme();
  if (kind === 'chat') return <ChatEmptyIllustration width={width} />;
  const wood = t.dark ? '#8A6A4F' : '#B08968';
  return (
    <Svg
      width={width}
      height={(width * 160) / 200}
      viewBox="0 0 200 160"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {floor(t.colors)}
      {draw(kind, t.colors, wood)}
    </Svg>
  );
}
