import { ApiError } from '@shop/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Agreements, NO_AGREEMENT, requiredAgreed } from '@/components/auth/agreements';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api, logout } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/**
 * 약관 동의: 소셜로 처음 로그인했거나 약관이 바뀌어 필수 동의가 남은 계정 (user.consentRequired).
 * 루트 가드가 이 화면만 열어 둔다. 동의하면 가드가 바뀌며 홈으로, 동의하지 않으면 로그아웃한다.
 */
export default function ConsentScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['auth', 'common']);
  const [agreement, setAgreement] = useState(NO_AGREEMENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = await api.auth.consent({
        terms: true,
        privacy: true,
        ageOver14: true,
        marketing: agreement.marketing,
      });
      useAuthStore.getState().setUser(me);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr('consent.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={{ gap: 6 }}>
        <Text variant="h2" accessibilityRole="header">
          {tr('consent.title')}
        </Text>
        <Text color="muted">{tr('consent.description')}</Text>
      </View>
      <Agreements value={agreement} onChange={setAgreement} />
      {error && (
        <Text variant="small" color="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <View style={{ gap: 8 }}>
        <Button
          title={tr('consent.submit')}
          size="lg"
          block
          loading={busy}
          disabled={!requiredAgreed(agreement)}
          onPress={() => void submit()}
        />
        <Button title={tr('consent.decline')} variant="ghost" block onPress={() => void logout()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 20 },
});
