import { useEffect, useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SWEEP_MS } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

/**
 * 진행 중인 버튼의 글자: 흐린 글자 위로 선명한 띠가 왼쪽에서 오른쪽으로 지나간다 (스켈레톤과 같은 속도).
 * 흐린 글자 한 벌 + 띠 모양 창으로 잘라 낸 선명한 글자 한 벌을 겹친다. 동작 줄이기면 흐린 글자만.
 */
export function ShimmerText({ active, style, ...props }: ComponentProps<typeof Text> & { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const band = Math.max(24, width * 0.45);
  const x = useSharedValue(0);
  useEffect(() => {
    if (!active || reduceMotion || !width) return;
    x.value = -band;
    x.value = withRepeat(
      withTiming(width, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [active, reduceMotion, width, band, x]);
  const windowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // 창이 움직이는 만큼 안쪽 글자를 거꾸로 옮겨 글자는 제자리에 있는 것처럼 보인다
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -x.value }] }));

  if (!active) return <Text {...props} style={style} />;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text {...props} numberOfLines={1} style={[style, styles.dim]} />
      {!reduceMotion && width > 0 && (
        <Animated.View pointerEvents="none" style={[styles.window, { width: band }, windowStyle]}>
          <Animated.View style={[styles.inner, { width }, innerStyle]}>
            <Text {...props} numberOfLines={1} style={style} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.35 },
  window: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  inner: { position: 'absolute', top: 0, left: 0 },
});
