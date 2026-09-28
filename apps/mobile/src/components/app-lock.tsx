import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { useTheme } from '@/theme';

/** 결제창·사진 선택처럼 잠깐 앱을 벗어나는 경우는 잠그지 않는다 */
const GRACE_MS = 60_000;

/** 앱 잠금: 켜져 있으면 실행할 때와 1분 넘게 떠났다 돌아올 때 생체 인증(없으면 기기 암호)으로 잠금 해제 */
export function AppLock() {
  const t = useTheme();
  const enabled = usePrefs((s) => s.appLock && s.hydrated) && Platform.OS !== 'web';
  const signedIn = !!useAuthStore((s) => s.user);
  const [locked, setLocked] = useState(true);
  const leftAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: '화소 잠금 해제',
      cancelLabel: '취소',
    });
    if (r.success) setLocked(false);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt.current = Date.now();
      if (s === 'active' && leftAt.current && Date.now() - leftAt.current > GRACE_MS) setLocked(true);
      if (s === 'active') leftAt.current = null;
    });
    return () => sub.remove();
  }, []);

  const show = enabled && signedIn && locked;
  useEffect(() => {
    if (show) void unlock();
  }, [show, unlock]);

  if (!show) return null;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: t.colors.background }]}
      accessibilityViewIsModal
    >
      <Text variant="h1">화소</Text>
      <Text color="muted">앱이 잠겨 있어요</Text>
      <Button title="잠금 해제" size="lg" onPress={() => void unlock()} style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 1000 },
});
