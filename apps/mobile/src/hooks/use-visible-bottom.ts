import { useSegments } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 떠 있는 탭 바(iOS 26)가 화면 아래에서 가리는 높이 — 홈 인디케이터 영역 포함 */
const TAB_BAR_COVER = 82;

/**
 * 화면에서 실제로 보이는 영역의 아래 끝 (탭 바·홈 인디케이터 위, 창 좌표).
 * 스크롤 영역은 헤더·탭 바 밑까지 이어지므로, 한 화면짜리 내용을 가운데 두거나 넘침을 판단할 때 쓴다.
 */
export function useVisibleBottom() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const root = useSegments()[0];
  const inTabs = root === '(tabs)' || root === 'admin';
  return height - (inTabs ? Math.max(TAB_BAR_COVER, insets.bottom) : insets.bottom);
}
