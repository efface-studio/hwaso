import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** 선택 햅틱 (버튼·칩·라디오·토글 공용). 웹 미리보기는 건너뛴다 */
export function selectionHaptic() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
}
