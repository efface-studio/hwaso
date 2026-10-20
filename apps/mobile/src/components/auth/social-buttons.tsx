import { ApiError } from '@shop/api-client';
import type { AuthProvider } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ShimmerText } from '@/components/ui/shimmer-text';
import { providerBrand as brand } from '@/components/auth/provider-logo';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { OAuthCancelled, appleNativeLogin, socialLogin } from '@/lib/oauth';
import { useTheme } from '@/theme';

const ORDER: AuthProvider[] = ['KAKAO', 'NAVER', 'GOOGLE', 'APPLE'];

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
  const { t: tr } = useTranslation(['auth', 'common']);
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
  const isConfigured = (data: typeof providers.data, p: AuthProvider) =>
    (p === 'APPLE' && Platform.OS === 'ios' && !!data?.appleNative) || !!data?.oauth.includes(p);
  // 서버가 응답하지 않아 목록을 모르면 버튼을 숨기지 않고 모두 보여준다 (누를 때 다시 확인)
  const visible = __DEV__ || !providers.data ? ORDER : ORDER.filter((p) => isConfigured(providers.data, p));
  if (!visible.length) return null;

  const run = async (p: AuthProvider) => {
    let data = providers.data;
    if (!data) {
      setBusy(p);
      data = (await providers.refetch()).data;
      setBusy(null);
      if (!data) {
        Alert.alert(tr('social.failedTitle'), tr('common:state.network'));
        return;
      }
    }
    const nativeApple = Platform.OS === 'ios' && !!data.appleNative;
    if (!isConfigured(data, p)) {
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
              {busy === p ? <ActivityIndicator color={b.fg} /> : b.icon}
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
            {/* 진행 중이면 글자가 스켈레톤처럼 반짝인다 */}
            <ShimmerText active={busy === p} variant="bodyStrong" style={{ color: b.fg }}>
              {continueWith(p)}
            </ShimmerText>
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
