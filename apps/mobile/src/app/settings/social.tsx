import { ApiError } from '@shop/api-client';
import { AUTH_PROVIDERS, type AuthProvider } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { OAuthCancelled, linkSocial } from '@/lib/oauth';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : i18n.t('common:state.actionFailed');

/** 연결된 소셜 계정: 연결하면 그 계정으로도 로그인할 수 있다 */
export default function SocialScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  if (!user) return null;
  if (providers.isPending) return <Loading variant="plain-list" />;
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
      Alert.alert(tr('social.linkedTitle', { provider: label('authProvider', p) }));
    } catch (e) {
      if (!(e instanceof OAuthCancelled)) Alert.alert(tr('social.linkFailed'), errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const unlink = (p: AuthProvider) =>
    Alert.alert(
      tr('social.unlinkConfirm', { provider: label('authProvider', p) }),
      tr('social.unlinkMessage'),
      [
        { text: tr('common:action.cancel'), style: 'cancel' },
        {
          text: tr('social.unlink'),
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
      ],
    );

  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: tr('common:screen.social') }} />
      {!available.length && <Text color="muted">{tr('social.none')}</Text>}
      {available.map((p) => {
        const linked = user.socialProviders.includes(p);
        return (
          <View key={p} style={[styles.row, { borderColor: t.colors.borderSoft, minHeight: t.touch + 12 }]}>
            <Text style={{ flex: 1 }}>
              {label('authProvider', p)}
              {linked ? (
                <Text variant="small" color="primary">
                  {'  '}
                  {tr('social.linkedBadge')}
                </Text>
              ) : null}
            </Text>
            <Button
              title={linked ? tr('social.disconnect') : tr('social.connect')}
              size="sm"
              variant={linked ? 'ghost' : 'outline'}
              loading={busy === p}
              onPress={() => (linked ? unlink(p) : void link(p))}
            />
          </View>
        );
      })}
      <Text variant="caption" color="muted">
        {tr('social.footnote')}
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
