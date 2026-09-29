import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from './text';

const PAD = 2;

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
  const x = useSharedValue(0);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!seg) return;
    // 처음 자리 잡을 때는 움직이지 않는다
    x.value = placed
      ? withTiming(index * seg, { duration: 220, easing: Easing.out(Easing.cubic) })
      : index * seg;
    if (!placed) setPlaced(true);
  }, [index, seg, placed, x]);

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
