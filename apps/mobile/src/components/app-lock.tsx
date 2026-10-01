import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t: tr } = useTranslation('common');
  const enabled = usePrefs((s) => s.appLock && s.hydrated) && Platform.OS !== 'web';
  const signedIn = !!useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const [locked, setLocked] = useState(true);
  const leftAt = useRef<number | null>(null);

  // 로그인하지 않은 채 시작했으면 잠글 것이 없다 — 이어서 로그인(Face ID 빠른 로그인 포함)해도 다시 묻지 않는다
  useEffect(() => {
    if (ready && !signedIn) setLocked(false);
  }, [ready, signedIn]);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: tr('appLock.prompt'),
      cancelLabel: tr('action.cancel'),
    });
    if (r.success) setLocked(false);
  }, [tr]);

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
      <Text variant="h1">{tr('brand.name')}</Text>
      <Text color="muted">{tr('appLock.locked')}</Text>
      <Button
        title={tr('appLock.unlock')}
        size="lg"
        onPress={() => void unlock()}
        style={{ marginTop: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 1000 },
});
