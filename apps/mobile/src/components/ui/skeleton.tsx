import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useGrid } from '@/hooks/use-grid';
import { READABLE_WIDTH, readable } from '@/hooks/use-layout';
import { useTheme } from '@/theme';

/** 빛 띠 폭과 한 번 지나가는 시간 */
const BAND = 180;
export const SWEEP_MS = 1400;

/** 한 화면의 블록들이 같은 빛 띠를 공유하도록 진행도(0→1)를 나눠 쓴다 */
const ShimmerClock = createContext<SharedValue<number> | null>(null);

function useSweep(enabled: boolean) {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!enabled || reduceMotion) return;
    p.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [enabled, reduceMotion, p]);
  return p;
}

/**
 * 불러오는 동안 실제 화면 모양을 흉내 내는 회색 블록. 왼쪽에서 오른쪽으로 빛 띠가 흘러간다
 * (같은 Frame 안의 블록들은 화면 좌표 기준으로 하나의 띠를 공유한다. 동작 줄이기면 멈춘다).
 */
export function Skeleton({
  width = '100%',
  height,
  radius,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const { width: screen } = useWindowDimensions();
  const shared = useContext(ShimmerClock);
  const own = useSweep(!shared);
  const clock = shared ?? own;
  // 동작 줄이기면 빛 띠를 아예 그리지 않는다 (멈춘 띠가 얼룩처럼 남지 않게, 블록마다 SVG 도 아낀다)
  const reduceMotion = useReducedMotion();
  const ref = useRef<View>(null);
  const left = useSharedValue(0);
  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAND + clock.value * (screen + BAND * 2) - left.value }],
  }));
  // 밝은 테마는 흰 빛을 진하게, 어두운 테마는 은은하게
  const peak = t.dark ? 0.14 : 0.75;
  return (
    <View
      ref={ref}
      onLayout={() => ref.current?.measureInWindow((x) => (left.value = x))}
      style={[
        styles.block,
        { width, height, borderRadius: radius ?? t.radius.sm, backgroundColor: t.colors.surface2 },
        style,
      ]}
    >
      {!reduceMotion && (
        <Animated.View style={[styles.band, band]}>
          <Svg width={BAND} height="100%">
            <Defs>
              <LinearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={peak} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={BAND} height="100%" fill="url(#shimmer)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * 스크린리더에는 "불러오는 중" 하나로 읽히게 감싸고, 안의 블록들이 하나의 빛 띠를 공유하게 한다.
 * 화면마다 실제 레이아웃을 본뜬 스켈레톤을 만들 때 이 틀 안에 Skeleton 블록을 놓는다.
 */
export function SkeletonFrame({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const clock = useSweep(true);
  const { t: tr } = useTranslation('common');
  return (
    <ShimmerClock.Provider value={clock}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={tr('state.loading')}
        pointerEvents="none"
        style={style}
      >
        {children}
      </View>
    </ShimmerClock.Provider>
  );
}

/** 목록형: 원형 사진 + 두 줄 (채팅·알림·주문·팔로워 등) */
export function SkeletonList({ rows = 8, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <SkeletonFrame style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listRow}>
          {avatar && <Skeleton width={44} height={44} radius={22} />}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="80%" height={12} />
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}

/** 작품 카드 하나 (이미지 4:5 + 작가·제목·가격) */
function CardSkeleton({ width }: { width: number }) {
  return (
    <View style={{ width, gap: 8 }}>
      <Skeleton width={width} height={(width * 5) / 4} radius={4} />
      <Skeleton width="45%" height={11} />
      <Skeleton width="80%" height={13} />
      <Skeleton width="55%" height={15} />
    </View>
  );
}

/** 작품 그리드형 (화면 폭에 맞춘 열 수) */
export function SkeletonGrid({ rows = 3 }: { rows?: number }) {
  const g = useGrid();
  return (
    <SkeletonFrame style={{ gap: 20, paddingTop: 12 }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: g.gap, paddingHorizontal: g.padding }}>
          {Array.from({ length: g.columns }, (_, c) => (
            <CardSkeleton key={c} width={g.cardWidth} />
          ))}
        </View>
      ))}
    </SkeletonFrame>
  );
}

/** 홈형: 배너 + 카테고리 칩 + 가로 작품 목록 두 줄 */
export function SkeletonHome() {
  const { width } = useWindowDimensions();
  const t = useTheme();
  const bannerW = Math.min(width, 900);
  const card = Math.round((t.senior ? 168 : 140) * t.scale);
  const rail = (key: string) => (
    <View key={key} style={{ paddingTop: 24, gap: 12 }}>
      <Skeleton width={140} height={20} style={{ marginHorizontal: 16 }} />
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, overflow: 'hidden' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} width={card} />
        ))}
      </View>
    </View>
  );
  return (
    <SkeletonFrame>
      <Skeleton
        width={bannerW}
        height={Math.round(bannerW * 0.56)}
        radius={0}
        style={{ alignSelf: 'center' }}
      />
      <View style={{ flexDirection: 'row', gap: 8, padding: 16 }}>
        {[64, 88, 80].map((w) => (
          <Skeleton key={w} width={w} height={36} radius={18} />
        ))}
      </View>
      {rail('a')}
      {rail('b')}
    </SkeletonFrame>
  );
}

/** 상세형: 큰 이미지 + 제목·가격 + 본문 여러 줄 (넓은 화면에서는 사진 갤러리처럼 폭·높이를 제한해 가운데) */
export function SkeletonDetail({ image = true }: { image?: boolean }) {
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, READABLE_WIDTH);
  return (
    <SkeletonFrame style={readable}>
      {image && <Skeleton width={width} height={Math.min(width, 640)} radius={0} />}
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton width="40%" height={13} />
        <Skeleton width="85%" height={22} />
        <Skeleton width="50%" height={24} />
        <View style={{ height: 8 }} />
        {[100, 95, 90, 70].map((w) => (
          <Skeleton key={w} width={`${w}%`} height={13} />
        ))}
      </View>
    </SkeletonFrame>
  );
}

/** 스켈레톤을 스크롤 가능한 화면 전체로 (헤더 인셋 자동) */
export function SkeletonScreen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND },
  list: { ...readable, paddingHorizontal: 16, paddingTop: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
});
