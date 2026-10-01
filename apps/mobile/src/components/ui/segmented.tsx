import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from './text';

const PAD = 2;

/**
 * 같은 옵션 묶음의 직전 선택 위치. 탭마다 다른 목록을 그려 세그먼트가 새로 마운트돼도
 * (관리자 목록 머리 등) 직전 자리에서 미끄러져 오게 한다
 */
const lastIndex = new Map<string, number>();

/** iOS 세그먼트 컨트롤 모양의 보기 전환 (2~4개). 선택 표시가 옆으로 미끄러진다 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const seg = width > 0 ? (width - PAD * 2) / options.length : 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const memoryKey = options.map((o) => o.value).join('|');
  const x = useSharedValue(0);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!seg) return;
    const slide = (to: number) => withTiming(to * seg, { duration: 220, easing: Easing.out(Easing.cubic) });
    if (placed) {
      x.value = slide(index);
    } else {
      // 처음 자리 잡을 때: 직전 선택이 다르면 그 자리에서 미끄러지고, 아니면 바로 놓는다
      const from = lastIndex.get(memoryKey);
      if (from != null && from !== index) {
        x.value = from * seg;
        x.value = slide(index);
      } else {
        x.value = index * seg;
      }
      setPlaced(true);
    }
    lastIndex.set(memoryKey, index);
  }, [index, seg, placed, x, memoryKey]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const height = t.senior ? 40 : 32;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { height, backgroundColor: t.colors.surface2 }]}
    >
      {seg > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            thumb,
            {
              width: seg,
              height: height - PAD * 2,
              backgroundColor: t.dark ? '#34343C' : t.colors.background,
              borderColor: t.colors.border,
            },
          ]}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              selectionHaptic();
              onChange(o.value);
            }}
            style={styles.item}
          >
            <Text variant="label" color={on ? 'foreground' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: PAD, borderRadius: 9 },
  thumb: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
