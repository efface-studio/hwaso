import { ApiError } from '@shop/api-client';
import { AUTH_PROVIDERS, AUTH_PROVIDER_LABEL, type AuthProvider } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { OAuthCancelled, linkSocial } from '@/lib/oauth';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : '처리하지 못했어요.';

/** 연결된 소셜 계정: 연결하면 그 계정으로도 로그인할 수 있다 */
export default function SocialScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  if (!user) return null;
  if (providers.isPending) return <Loading />;
  // iOS 의 Apple 로그인은 시스템 방식이라 여기서는 브라우저로 연결할 수 있는 제공자만 연결한다
  const available = AUTH_PROVIDERS.filter(
    (p) =>
      (providers.data?.oauth.includes(p) && !(p === 'APPLE' && Platform.OS === 'ios')) ||
      user.socialProviders.includes(p),
  );

  const link = async (p: AuthProvider) => {
    setBusy(p);
    try {
      await linkSocial(p);
      setUser(await api.auth.me());
      Alert.alert(`${AUTH_PROVIDER_LABEL[p]} 계정을 연결했어요`);
    } catch (e) {
      if (!(e instanceof OAuthCancelled)) Alert.alert('연결하지 못했어요', errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const unlink = (p: AuthProvider) =>
    Alert.alert(`${AUTH_PROVIDER_LABEL[p]} 연결을 해제할까요?`, '해제하면 이 계정으로 로그인할 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '해제',
        style: 'destructive',
        onPress: async () => {
          setBusy(p);
          try {
            await api.auth.unlinkSocial(p);
            setUser({ ...user, socialProviders: user.socialProviders.filter((x) => x !== p) });
          } catch (e) {
            Alert.alert(errMsg(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: '연결된 소셜 계정' }} />
      {!available.length && <Text color="muted">사용할 수 있는 소셜 로그인이 없어요.</Text>}
      {available.map((p) => {
        const linked = user.socialProviders.includes(p);
        return (
          <View key={p} style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}>
            <Text style={{ flex: 1 }}>
              {AUTH_PROVIDER_LABEL[p]}
              {linked ? (
                <Text variant="small" color="primary">
                  {'  '}연결됨
                </Text>
              ) : null}
            </Text>
            <Button
              title={linked ? '연결 해제' : '연결하기'}
              size="sm"
              variant={linked ? 'ghost' : 'outline'}
              loading={busy === p}
              onPress={() => (linked ? unlink(p) : void link(p))}
            />
          </View>
        );
      })}
      <Text variant="caption" color="muted">
        비밀번호가 없고 연결된 계정이 하나뿐이면 해제할 수 없어요. 먼저 비밀번호를 설정해주세요.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
