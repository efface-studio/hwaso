import { ApiError } from '@shop/api-client';
import type { AuthProvider } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { OAuthCancelled, appleNativeLogin, socialLogin } from '@/lib/oauth';
import { useTheme, type Theme } from '@/theme';

const ORDER: AuthProvider[] = ['KAKAO', 'NAVER', 'GOOGLE', 'APPLE'];

/**
 * 각 사 브랜드 가이드의 색·로고 (웹 components/auth/social-buttons.tsx 와 같은 값).
 * Google 은 테마 배경 + 테두리, Apple 은 테마 반대색(라이트: 검정, 다크: 흰색)
 */
function brand(p: AuthProvider, t: Theme): { bg: string; fg: string; border?: string; icon: ReactNode } {
  switch (p) {
    case 'KAKAO':
      return {
        bg: '#FEE500',
        fg: '#191919',
        icon: (
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              fill="#191919"
              d="M12 3C6.48 3 2 6.47 2 10.75c0 2.77 1.86 5.2 4.66 6.57-.2.74-.74 2.7-.85 3.12-.13.52.19.51.4.37.17-.11 2.62-1.78 3.68-2.5.69.1 1.39.16 2.11.16 5.52 0 10-3.47 10-7.72S17.52 3 12 3Z"
            />
          </Svg>
        ),
      };
    case 'NAVER':
      return {
        bg: '#03C75A',
        fg: '#FFFFFF',
        icon: (
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path fill="#FFFFFF" d="M16.27 12.84 7.46 0H0v24h7.73V11.16L16.54 24H24V0h-7.73z" />
          </Svg>
        ),
      };
    case 'GOOGLE':
      return {
        bg: t.colors.background,
        fg: t.colors.foreground,
        border: t.colors.borderStrong,
        icon: (
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              fill="#4285F4"
              d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
            />
            <Path
              fill="#34A853"
              d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
            />
            <Path
              fill="#FBBC05"
              d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
            />
            <Path
              fill="#EA4335"
              d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
            />
          </Svg>
        ),
      };
    case 'APPLE':
      return {
        bg: t.colors.secondary,
        fg: t.colors.secondaryForeground,
        icon: (
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              fill={t.colors.secondaryForeground}
              d="M16.37 12.63c-.03-2.6 2.13-3.86 2.23-3.92-1.22-1.78-3.11-2.02-3.78-2.05-1.6-.16-3.13.95-3.94.95-.82 0-2.07-.93-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.46 7.8 1.3 10.36.87 1.25 1.9 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.29-1.27 3.14-2.53a11 11 0 0 0 1.43-2.93c-.03-.02-2.73-1.05-2.76-4.13ZM13.8 5c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.29.69-3.03 1.56-.66.77-1.25 2-1.09 3.18 1.15.09 2.33-.58 3.05-1.45Z"
            />
          </Svg>
        ),
      };
  }
}

/**
 * 간편 로그인 (웹과 같은 순서·모양). iOS 의 Apple 은 시스템 Sign in with Apple, 나머지는 인앱 브라우저 OAuth.
 * 운영에서는 설정된 방식만 보이고, 개발에서는 모두 보이되 설정 안 된 방식을 누르면 안내한다.
 * compact 면 로고만 있는 원형 버튼 한 줄 (낮은 화면에서 스크롤 없이 들어가게).
 */
export function SocialButtons({
  onDone,
  compact = false,
}: {
  onDone: (isNewUser: boolean) => void;
  compact?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('auth');
  const continueWith = (p: AuthProvider) => tr('social.continueWith', { provider: label('authProvider', p) });
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  // Expo Go 에는 Sign in with Apple 네이티브 모듈이 없다 (개발 빌드·배포 빌드에서만 동작)
  const [appleModule, setAppleModule] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleModule);
  }, []);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  const nativeApple = Platform.OS === 'ios' && !!providers.data?.appleNative;
  const configured = (p: AuthProvider) =>
    (p === 'APPLE' && nativeApple) || !!providers.data?.oauth.includes(p);
  const visible = __DEV__ ? ORDER : ORDER.filter(configured);
  if (!visible.length) return null;

  const run = async (p: AuthProvider) => {
    if (!configured(p)) {
      Alert.alert(
        tr('social.notConfiguredTitle', { provider: label('authProvider', p) }),
        tr('social.notConfiguredMessage'),
      );
      return;
    }
    if (p === 'APPLE' && nativeApple && !appleModule) {
      Alert.alert(tr('social.appleBuildOnlyTitle'), tr('social.appleBuildOnlyMessage'));
      return;
    }
    setBusy(p);
    try {
      const r = p === 'APPLE' && nativeApple ? await appleNativeLogin() : await socialLogin(p);
      onDone(r.isNewUser);
    } catch (e) {
      if (!(e instanceof OAuthCancelled))
        Alert.alert(tr('social.failedTitle'), e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (compact)
    return (
      <View style={styles.row}>
        {visible.map((p) => {
          const b = brand(p, t);
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={continueWith(p)}
              disabled={!!busy}
              onPress={() => void run(p)}
              style={({ pressed }) => [
                styles.round,
                {
                  backgroundColor: b.bg,
                  borderColor: b.border ?? b.bg,
                  opacity: busy && busy !== p ? 0.6 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {b.icon}
            </Pressable>
          );
        })}
      </View>
    );

  return (
    <View style={{ gap: 8 }}>
      {visible.map((p) => {
        const b = brand(p, t);
        return (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={continueWith(p)}
            disabled={!!busy}
            onPress={() => void run(p)}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: b.bg,
                borderColor: b.border ?? b.bg,
                minHeight: t.controlHeight,
                borderRadius: t.radius.sm,
                opacity: busy && busy !== p ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={styles.icon}>{b.icon}</View>
            <Text variant="bodyStrong" style={{ color: b.fg }}>
              {busy === p ? tr('social.redirecting') : continueWith(p)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth * 2 },
  icon: { position: 'absolute', left: 16 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
