import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MAX = 5;

/** 전체 화면 작품 보기: 두 손가락 확대·이동, 두 번 탭하면 2.5배 ↔ 원래 크기 */
export function ZoomableImage({ uri, label }: { uri: string; label: string }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    saved.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    sx.value = 0;
    sy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.01) reset();
    });
  // 확대했을 때만 이동 (원래 크기에서는 옆 사진으로 넘기기가 동작해야 한다)
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (saved.value > 1) state.activate();
      else state.fail();
    })
    .onUpdate((e) => {
      x.value = sx.value + e.translationX;
      y.value = sy.value + e.translationY;
    })
    .onEnd(() => {
      sx.value = x.value;
      sy.value = y.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (saved.value > 1) reset();
      else {
        scale.value = withTiming(2.5);
        saved.value = 2.5;
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        {/* 상세 사진과 같은 w1600 이면(휴대폰 3배 화면) 메모리 캐시에서 바로 나온다 */}
        <Image
          source={uri}
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          accessibilityLabel={label}
        />
      </Animated.View>
    </GestureDetector>
  );
}
