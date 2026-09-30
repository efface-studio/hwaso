import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

// React Query 가 기기 네트워크 상태를 알도록 연결 — 끊기면 요청을 멈추고, 다시 연결되면 자동으로 다시 불러온다
if (Platform.OS !== 'web')
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((s) => setOnline(s.isConnected !== false));
    return () => sub.remove();
  });

/** 오프라인 안내 배너 (연결되면 사라진다) */
export function OfflineBanner() {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: t.colors.foreground }]}
    >
      <Text variant="small" style={{ color: t.colors.background }}>
        {tr('state.offline')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 6,
    zIndex: 999,
  },
});
