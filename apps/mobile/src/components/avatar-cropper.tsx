import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { cropSquare, normalizeImage, type LocalImage } from '@/lib/upload';

/** 최대 확대 배율 (원 안을 꽉 채운 크기 기준) */
const MAX_SCALE = 5;
/** 잘라낸 프로필 사진 크기 (px) — 서버가 w400 파생 이미지를 만든다 */
const OUTPUT = 800;
const GUTTER = 24;

type Source = { uri: string; width: number; height: number };

/**
 * 프로필 사진 자르기: 원 안에 들어올 영역을 두 손가락으로 확대하고 끌어서 맞춘다 (두 번 탭하면 처음 크기).
 * 사진은 항상 원을 꽉 채우도록(빈 곳이 생기지 않게) 이동 범위를 막는다. 완료하면 정사각형으로 잘라 돌려준다.
 */
export function AvatarCropper({
  image,
  onCancel,
  onDone,
}: {
  image: LocalImage | null;
  onCancel: () => void;
  onDone: (cropped: LocalImage) => void;
}) {
  const insets = useSafeAreaInsets();
  const [src, setSrc] = useState<Source | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  // 회전(EXIF)을 적용하고 실제 픽셀 크기를 얻는다
  useEffect(() => {
    setSrc(null);
    if (!image) return;
    let alive = true;
    normalizeImage(image.uri)
      .then((r) => alive && setSrc(r))
      .catch(() => {
        if (!alive) return;
        Alert.alert('사진을 열지 못했어요', '다른 사진을 골라주세요.');
        onCancel();
      });
    scale.value = 1;
    savedScale.value = 1;
    x.value = 0;
    y.value = 0;
    sx.value = 0;
    sy.value = 0;
    return () => {
      alive = false;
    };
  }, [image, onCancel, scale, savedScale, x, y, sx, sy]);

  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // 원 지름, 원을 꽉 채우는 기본 표시 크기
  const d = box ? Math.min(box.w - GUTTER * 2, box.h - GUTTER * 2) : 0;
  const base = src && d ? Math.max(d / src.width, d / src.height) : 0;
  const bw = src ? src.width * base : 0;
  const bh = src ? src.height * base : 0;

  const clampT = (t: number, k: number, size: number) => {
    'worklet';
    const max = Math.max(0, (size * k - d) / 2);
    return Math.min(max, Math.max(-max, t));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const k = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale));
      scale.value = k;
      x.value = clampT(x.value, k, bw);
      y.value = clampT(y.value, k, bh);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      sx.value = x.value;
      sy.value = y.value;
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      x.value = clampT(sx.value + e.translationX, scale.value, bw);
      y.value = clampT(sy.value + e.translationY, scale.value, bh);
    })
    .onEnd(() => {
      sx.value = x.value;
      sy.value = y.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(1);
      savedScale.value = 1;
      x.value = withTiming(0);
      y.value = withTiming(0);
      sx.value = 0;
      sy.value = 0;
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  const done = async () => {
    if (!src || !base) return;
    // 화면의 원 → 원본 픽셀 영역
    const k = scale.value * base;
    const size = Math.min(src.width, src.height, d / k);
    const cx = src.width / 2 - x.value / k;
    const cy = src.height / 2 - y.value / k;
    const rect = {
      originX: Math.round(Math.min(src.width - size, Math.max(0, cx - size / 2))),
      originY: Math.round(Math.min(src.height - size, Math.max(0, cy - size / 2))),
      width: Math.floor(size),
      height: Math.floor(size),
    };
    setSaving(true);
    try {
      onDone(await cropSquare(src.uri, rect, Math.min(OUTPUT, rect.width)));
    } catch {
      Alert.alert('사진을 자르지 못했어요', '잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const r = d / 2;
  const cx = box ? box.w / 2 : 0;
  const cy = box ? box.h / 2 : 0;

  return (
    <Modal visible={!!image} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={12} disabled={saving}>
            <Text variant="bodyStrong" style={styles.light}>
              취소
            </Text>
          </Pressable>
          <Text variant="h3" style={styles.light}>
            사진 조정
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void done()}
            hitSlop={12}
            disabled={!src || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text variant="bodyStrong" style={[styles.light, !src && { opacity: 0.4 }]}>
                완료
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.stage} onLayout={onLayout}>
          {src && box ? (
            <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
              <View style={StyleSheet.absoluteFill}>
                <Animated.View
                  style={[
                    { position: 'absolute', width: bw, height: bh, left: cx - bw / 2, top: cy - bh / 2 },
                    imageStyle,
                  ]}
                >
                  <Image
                    source={src.uri}
                    style={StyleSheet.absoluteFill}
                    contentFit="fill"
                    accessibilityLabel="자를 사진"
                  />
                </Animated.View>
                {/* 원 밖은 어둡게 */}
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Path
                    d={`M0 0H${box.w}V${box.h}H0Z M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`}
                    fill="#000000"
                    fillOpacity={0.62}
                    fillRule="evenodd"
                  />
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    stroke="#FFFFFF"
                    strokeOpacity={0.9}
                    strokeWidth={1.5}
                    fill="none"
                  />
                </Svg>
              </View>
            </GestureDetector>
          ) : (
            <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />
          )}
        </View>

        <Text variant="small" style={[styles.hint, { paddingBottom: insets.bottom + 20 }]}>
          두 손가락으로 확대하고, 끌어서 위치를 맞춰요
        </Text>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  light: { color: '#FFFFFF' },
  stage: { flex: 1, overflow: 'hidden' },
  hint: { color: '#FFFFFFB3', textAlign: 'center', paddingTop: 16 },
});
