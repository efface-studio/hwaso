import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { HwasoMark, MARK_ORIGIN } from '@/components/brand/hwaso-mark';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** 네이티브 스플래시(app.config.ts expo-splash-screen imageWidth)와 같은 크기 */
const MARK_SIZE = 160;
const easeOut = Easing.out(Easing.cubic);

/**
 * 앱 시작 스플래시. 네이티브 스플래시와 같은 자리의 마크에서 이어받아
 * 두 말풍선이 대화하듯 튀고 → 마크가 올라가며 워드마크가 나타나고 → 준비되면 마크가 커지며 사라진다.
 * ready(로그인 상태 복구 완료) 전에는 인트로가 끝나도 기다린다. 동작 줄이기 설정이면 페이드만 한다.
 */
export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const reduceMotion = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  const square = useSharedValue(0);
  const circle = useSharedValue(0);
  const lift = useSharedValue(0);
  const word = useSharedValue(0);
  const exit = useSharedValue(0);

  // 첫 프레임이 그려진 뒤 네이티브 스플래시를 내리고 인트로를 시작한다
  const onLayout = () => {
    if (started) return;
    setStarted(true);
    void SplashScreen.hideAsync();
  };

  useEffect(() => {
    if (!started) return;
    if (reduceMotion) {
      word.value = 1;
      setIntroDone(true);
      return;
    }
    const pop = withSequence(
      withTiming(1, { duration: 220, easing: easeOut }),
      withSpring(0, { damping: 7, stiffness: 170 }),
    );
    square.value = withDelay(120, pop);
    circle.value = withDelay(260, pop);
    lift.value = withDelay(620, withSpring(1, { damping: 15, stiffness: 120 }));
    word.value = withDelay(
      720,
      withTiming(1, { duration: 480, easing: easeOut }, (finished) => {
        if (finished) scheduleOnRN(setIntroDone, true);
      }),
    );
  }, [started, reduceMotion, square, circle, lift, word]);

  useEffect(() => {
    if (!introDone || !ready) return;
    exit.value = withTiming(
      1,
      { duration: reduceMotion ? 220 : 520, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) scheduleOnRN(onFinish);
      },
    );
  }, [introDone, ready, reduceMotion, exit, onFinish]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -44 * lift.value }, { scale: 1 + (reduceMotion ? 0 : 0.35) * exit.value }],
  }));
  const squareStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -7 * square.value },
      { translateY: -9 * square.value },
      { rotate: `${-12 * square.value}deg` },
      { scale: 1 + 0.06 * square.value },
    ],
  }));
  const circleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: 7 * circle.value },
      { translateY: 6 * circle.value },
      { rotate: `${14 * circle.value}deg` },
      { scale: 1 + 0.08 * circle.value },
    ],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value * (1 - exit.value),
    transform: [{ translateY: 14 * (1 - word.value) - 44 * lift.value }],
  }));

  const shadow = {
    shadowColor: t.dark ? '#000000' : '#063d26',
    shadowOpacity: t.dark ? 0.45 : 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  };

  return (
    <Animated.View
      pointerEvents={introDone && ready ? 'none' : 'auto'}
      onLayout={onLayout}
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: t.colors.background }, overlayStyle]}
      accessibilityLabel={tr('brand.name')}
      accessibilityRole="image"
    >
      <Animated.View style={[styles.mark, markStyle]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, shadow, { transformOrigin: MARK_ORIGIN.square }, squareStyle]}
        >
          <HwasoMark size={MARK_SIZE} part="square" />
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, shadow, { transformOrigin: MARK_ORIGIN.circle }, circleStyle]}
        >
          <HwasoMark size={MARK_SIZE} part="circle" />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.word, wordStyle]}>
        <View style={styles.titleRow}>
          <Text variant="h1" style={styles.title}>
            {tr('brand.name')}
          </Text>
          <Text variant="small" color="muted">
            畫所
          </Text>
        </View>
        <Text variant="small" color="muted">
          {tr('splash.tagline')}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  // 마크 아래 (마크 중심 기준) — 처음엔 마크만 정중앙에 있어 네이티브 스플래시와 겹친다
  word: { position: 'absolute', top: '50%', marginTop: MARK_SIZE / 2 - 8, alignItems: 'center', gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { fontSize: 30, lineHeight: 38 },
});
