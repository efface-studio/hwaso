import { useSegments } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements';
import { useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 떠 있는 탭 바(iOS 26)가 화면 아래에서 가리는 높이 — 홈 인디케이터 영역 포함 */
const TAB_BAR_COVER = 82;

/**
 * 스크롤 화면에서 실제로 보이는 높이 (헤더 아래 ~ 탭 바·홈 인디케이터 위).
 * 스크롤 영역은 헤더·탭 바 밑까지 이어지고 그 여백(content inset)은 네이티브에서만 적용되어
 * JS 에서 잰 위치에는 반영되지 않는다 — 그래서 헤더 높이와 탭 바 높이로 직접 계산한다.
 */
export function useVisibleHeight() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const header = useContext(HeaderHeightContext) ?? insets.top;
  const root = useSegments()[0];
  const inTabs = root === '(tabs)' || root === 'admin';
  return height - header - (inTabs ? Math.max(TAB_BAR_COVER, insets.bottom) : insets.bottom);
}
