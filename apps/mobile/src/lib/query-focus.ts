import { focusManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/**
 * React Query 가 앱 전경/배경을 알도록 연결 (웹은 브라우저 포커스 이벤트를 그대로 쓴다).
 * 배경에 있는 동안 주기 갱신(refetchInterval)을 멈추고, 돌아오면 오래된 데이터만 다시 불러온다.
 */
export function connectQueryFocus() {
  if (Platform.OS === 'web') return;
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
    return () => sub.remove();
  });
}
