import { ApiError } from '@shop/api-client';
import type { AuthProvider } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { OAuthCancelled, appleNativeLogin, socialLogin } from '@/lib/oauth';
import { useTheme } from '@/theme';

/** 각 서비스의 로그인 버튼 가이드 색 */
const BRAND: Record<
  Exclude<AuthProvider, 'APPLE'>,
  { label: string; bg: string; fg: string; border?: string }
> = {
  KAKAO: { label: '카카오로 계속하기', bg: '#FEE500', fg: '#191919' },
  NAVER: { label: '네이버로 계속하기', bg: '#03C75A', fg: '#FFFFFF' },
  GOOGLE: { label: 'Google로 계속하기', bg: '#FFFFFF', fg: '#1F1F1F', border: '#747775' },
};

export function SocialButtons({ onDone }: { onDone: (isNewUser: boolean) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  // 키가 설정된 방식만 보인다 (개발 중에는 화면 확인을 위해 모두 보인다)
  const enabled = (p: AuthProvider) => __DEV__ || !!providers.data?.oauth.includes(p);

  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const run = async (p: AuthProvider, fn: () => Promise<{ isNewUser: boolean }>) => {
    setBusy(p);
    try {
      const r = await fn();
      onDone(r.isNewUser);
    } catch (e) {
      if (!(e instanceof OAuthCancelled))
        Alert.alert('로그인하지 못했어요', e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {(Object.keys(BRAND) as (keyof typeof BRAND)[]).filter(enabled).map((p) => {
        const b = BRAND[p];
        return (
          <Pressable
            key={p}
            accessibilityRole="button"
            disabled={!!busy}
            onPress={() => void run(p, () => socialLogin(p))}
            style={[
              styles.btn,
              {
                backgroundColor: b.bg,
                borderColor: b.border ?? b.bg,
                minHeight: t.controlHeight,
                borderRadius: t.radius.sm,
                opacity: busy && busy !== p ? 0.5 : 1,
              },
            ]}
          >
            <Text variant="bodyStrong" style={{ color: b.fg }}>
              {busy === p ? '연결 중…' : b.label}
            </Text>
          </Pressable>
        );
      })}
      {enabled('APPLE') &&
        (appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              t.dark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={t.radius.sm}
            style={{ height: t.controlHeight }}
            onPress={() => void run('APPLE', appleNativeLogin)}
          />
        ) : (
          Platform.OS !== 'ios' && (
            <Pressable
              accessibilityRole="button"
              disabled={!!busy}
              onPress={() => void run('APPLE', () => socialLogin('APPLE'))}
              style={[
                styles.btn,
                {
                  backgroundColor: t.dark ? '#FFFFFF' : '#000000',
                  minHeight: t.controlHeight,
                  borderRadius: t.radius.sm,
                },
              ]}
            >
              <Text variant="bodyStrong" style={{ color: t.dark ? '#000000' : '#FFFFFF' }}>
                Apple로 계속하기
              </Text>
            </Pressable>
          )
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
