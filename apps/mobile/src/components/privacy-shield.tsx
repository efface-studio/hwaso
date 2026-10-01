import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, Platform, StyleSheet, View } from 'react-native';
import { HwasoMark } from '@/components/brand/hwaso-mark';
import { useTheme } from '@/theme';

/** 네이티브 스플래시(app.config.ts expo-splash-screen imageWidth)와 같은 크기 */
const MARK_SIZE = 160;

const isAway = (state: AppStateStatus) => state === 'inactive' || state === 'background';

/**
 * 앱 전환 화면(iOS 앱 스위처 스냅숏)에 주문·계좌·채팅 내용이 보이지 않게 앱을 떠나는 순간 화면 전체를 덮는다.
 * 스냅숏보다 먼저 그려져야 해서 애니메이션 없이 바로 보였다가, 돌아오면(active) 바로 걷는다.
 * Android 최근 앱 미리보기는 민감한 화면의 useScreenGuard(FLAG_SECURE)가 가린다.
 * 루트 레이아웃의 가장 위(마지막 자식)에 한 번만 둔다.
 */
export function PrivacyShield() {
  const t = useTheme();
  const [away, setAway] = useState(() => isAway(AppState.currentState));

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => setAway(isAway(state)));
    return () => sub.remove();
  }, []);

  if (!away || Platform.OS === 'web') return null;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: t.colors.background }]}
    >
      <HwasoMark size={MARK_SIZE} />
    </View>
  );
}

const styles = StyleSheet.create({
  // AppLock(1000)·스플래시보다 위
  cover: { alignItems: 'center', justifyContent: 'center', zIndex: 10000, elevation: 10000 },
});
