import { palette } from '@shop/tokens';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { selectionHaptic } from '@/lib/haptics';
import type { ThemePreference } from '@/stores/prefs';
import { useTheme } from '@/theme';

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

/** 미리보기 좌표계 (휴대폰 화면 비율) */
const VW = 100;
const VH = 172;

/**
 * 우리 앱 홈 화면을 줄인 그림: 로고·알림 버튼 · 배너 · 작품 카드 두 장 · 떠 있는 탭 바(오른쪽 원형 마이 버튼).
 * 라이트/다크 팔레트 색을 그대로 쓴다.
 */
function Screen({ scheme }: { scheme: 'light' | 'dark' }) {
  const c = palette[scheme];
  const glass = scheme === 'dark' ? '#26262C' : '#FFFFFF';
  const line = scheme === 'dark' ? '#3A3A42' : '#E4E4E7';
  return (
    <G>
      <Rect width={VW} height={VH} fill={c.background} />
      {/* 헤더: 로고 · 알림 */}
      <Path d="M10 14 h7 q2 0 2 2 v4 q0 2 -2 2 h-3 l-3 3 v-3 q-1 0 -1 -2 v-4 q0 -2 2 -2 z" fill={c.primary} />
      <Circle cx={21} cy={21} r={4} fill={scheme === 'dark' ? '#3FD08A' : '#0C603D'} />
      <Circle cx={86} cy={18} r={5} fill={glass} stroke={line} strokeWidth={0.8} />
      {/* 배너 */}
      <Rect x={0} y={32} width={VW} height={46} fill={c.primary} opacity={0.9} />
      <Circle cx={74} cy={48} r={8} fill="#F2B84B" />
      <Path d="M0 78 L0 66 Q20 54 38 64 Q56 56 72 66 Q86 60 100 66 L100 78 Z" fill="#0C603D" opacity={0.55} />
      <Rect x={8} y={68} width={34} height={4} rx={2} fill="#FFFFFF" opacity={0.9} />
      {/* 작품 카드 두 장 */}
      <Rect x={8} y={88} width={39} height={44} rx={3} fill={c.surface2} />
      <Rect x={53} y={88} width={39} height={44} rx={3} fill={c.surface2} />
      <Rect x={8} y={136} width={26} height={3.5} rx={1.75} fill={c.foreground} opacity={0.55} />
      <Rect x={53} y={136} width={22} height={3.5} rx={1.75} fill={c.foreground} opacity={0.55} />
      <Rect x={8} y={142} width={18} height={3.5} rx={1.75} fill={c.foreground} opacity={0.25} />
      <Rect x={53} y={142} width={20} height={3.5} rx={1.75} fill={c.foreground} opacity={0.25} />
      {/* 떠 있는 탭 바 + 오른쪽 원형 버튼 */}
      <Rect x={6} y={153} width={68} height={13} rx={6.5} fill={glass} stroke={line} strokeWidth={0.8} />
      <Circle cx={15} cy={159.5} r={2.2} fill={c.primary} />
      {[31, 46, 61].map((x) => (
        <Circle key={x} cx={x} cy={159.5} r={2.2} fill={c.foreground} opacity={0.35} />
      ))}
      <Circle cx={86} cy={159.5} r={6.5} fill={glass} stroke={line} strokeWidth={0.8} />
      <Circle cx={86} cy={159.5} r={3} fill={c.foreground} opacity={0.35} />
    </G>
  );
}

function Preview({ value, width }: { value: ThemePreference; width: number }) {
  const height = (width * VH) / VW;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`}>
      <Defs>
        {/* 시스템: 대각선으로 라이트 / 다크 반반 */}
        <ClipPath id="half">
          <Path d={`M0 0 H${VW} L0 ${VH} Z`} />
        </ClipPath>
      </Defs>
      {value === 'system' ? (
        <>
          <Screen scheme="dark" />
          <G clipPath="url(#half)">
            <Screen scheme="light" />
          </G>
        </>
      ) : (
        <Screen scheme={value} />
      )}
    </Svg>
  );
}

/** 화면 모드 선택: 우리 앱 화면을 줄인 미리보기 3장 (선택하면 초록 테두리) */
export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const [cardWidth, setCardWidth] = useState(0);
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={tr('theme.title')}>
      {OPTIONS.map((mode) => {
        const o = { value: mode, label: tr(`theme.${mode}`) };
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              selectionHaptic();
              onChange(o.value);
            }}
            style={({ pressed }) => [styles.option, { opacity: pressed ? 0.8 : 1 }]}
          >
            {/* 선택 테두리는 한 칸 띄워 감싼다 */}
            <View
              onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
              style={[styles.ring, { borderColor: on ? t.colors.primary : 'transparent' }]}
            >
              <View style={[styles.phone, { borderColor: t.colors.border }]}>
                {cardWidth > 0 && (
                  <Preview
                    value={o.value}
                    width={Math.floor(cardWidth - 10 - StyleSheet.hairlineWidth * 4)}
                  />
                )}
              </View>
            </View>
            <View style={styles.labelRow}>
              <View
                style={[
                  styles.check,
                  {
                    borderColor: on ? t.colors.primary : t.colors.borderStrong,
                    backgroundColor: on ? t.colors.primary : 'transparent',
                  },
                ]}
              >
                {on && <Icon ios="checkmark" android="check" color="primaryForeground" size={11} />}
              </View>
              <Text variant="label" color={on ? 'foreground' : 'muted'}>
                {o.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  option: { flex: 1, alignItems: 'center', gap: 10 },
  ring: { width: '100%', padding: 3, borderWidth: 2, borderRadius: 20 },
  phone: { borderRadius: 15, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden', padding: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
