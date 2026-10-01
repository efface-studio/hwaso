import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { currentLanguage, LOCALE } from '@/i18n';
import { api } from '@/lib/api';
import { BridgeCancelled, verifyIdentity } from '@/lib/bridge';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';
import { readable } from '@/hooks/use-layout';

/** PASS 본인인증: 휴대폰 명의 확인 (판매 정산·성인 인증에 필요) */
export default function IdentityScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  const status = useQuery({ queryKey: ['identity'], queryFn: api.auth.identity });
  const [pending, setPending] = useState(false);
  if (!user) return null;
  if (status.isPending) return <Loading variant="text" />;

  const verify = async () => {
    // 키가 없는 개발 환경에서도 화면은 보이게 두고, 눌렀을 때 안내한다
    if (!providers.data?.identity)
      return Alert.alert(tr('identity.notReadyTitle'), tr('identity.notReadyMessage'));
    setPending(true);
    try {
      await verifyIdentity();
      setUser({ ...user, identityVerified: true });
      await qc.invalidateQueries({ queryKey: ['identity'] });
      Alert.alert(tr('identity.doneTitle'));
    } catch (e) {
      if (!(e instanceof BridgeCancelled)) Alert.alert(tr('identity.failedTitle'), (e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const s = status.data;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: tr('common:screen.identity') }} />
      {s?.verified ? (
        <View style={[styles.card, { borderColor: t.colors.primary }]}>
          <Text variant="bodyStrong">{tr('identity.verified')}</Text>
          <Text variant="small" color="muted">
            {s.nameMasked} · {s.phoneMasked} · {s.isAdult ? tr('identity.adult') : tr('identity.minor')}
          </Text>
          {s.verifiedAt && (
            <Text variant="caption" color="muted">
              {tr('identity.verifiedAt', {
                date: new Date(s.verifiedAt).toLocaleDateString(LOCALE[currentLanguage()]),
              })}
            </Text>
          )}
        </View>
      ) : (
        <>
          <Text color="muted">{tr('identity.description')}</Text>
          <Button title={tr('identity.button')} size="lg" loading={pending} onPress={() => void verify()} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { ...readable, padding: 20, gap: 14 },
  card: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 4 },
});
