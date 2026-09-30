import { ApiError } from '@shop/api-client';
import { COMPANY, type AuthProvider, type DeleteAccountInput } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { OAuthCancelled, socialDeleteProof } from '@/lib/oauth';
import { unregisterPush } from '@/lib/push';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : i18n.t('common:state.actionFailed');

/**
 * 회원 탈퇴: 본인 확인 후 탈퇴.
 * - 비밀번호가 있으면 비밀번호
 * - 연결된 소셜 계정이 있으면 그 계정으로 한 번 더 로그인해 확인 (Apple 로 이메일을 가린 가입자처럼 받을 수 있는 이메일이 없어도 된다)
 * - 비밀번호가 없고 실제 이메일이면 이메일 인증번호
 */
export default function DeleteAccountScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const user = useAuthStore((s) => s.user);
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: api.auth.providers,
    staleTime: 600_000,
  });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [proof, setProof] = useState<{ provider: AuthProvider; body: DeleteAccountInput } | null>(null);
  const [verifying, setVerifying] = useState<AuthProvider | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  // 받을 수 없는 이메일(소셜 가입 시 서버가 만든 주소)로는 인증번호를 보내지 않는다
  const realEmail = !user.email.endsWith('.invalid');
  const useCode = !user.hasPassword && realEmail;
  const nativeApple = Platform.OS === 'ios' && !!providers.data?.appleNative;
  const socials = user.socialProviders.filter(
    (p) => (p === 'APPLE' && nativeApple) || !!providers.data?.oauth.includes(p),
  );

  const sendCode = async () => {
    try {
      await api.auth.sendCode({ email: user.email, purpose: 'DELETE_ACCOUNT' });
      setCodeSent(true);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  const verifySocial = async (p: AuthProvider) => {
    setVerifying(p);
    setError(null);
    try {
      setProof({ provider: p, body: await socialDeleteProof(p, nativeApple) });
    } catch (e) {
      if (!(e instanceof OAuthCancelled)) setError(errMsg(e));
    } finally {
      setVerifying(null);
    }
  };
  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      if (proof) {
        await api.auth.deleteAccount(proof.body);
      } else if (user.hasPassword) {
        await api.auth.deleteAccount({ password });
      } else {
        const { verificationToken } = await api.auth.verifyCode({
          email: user.email,
          purpose: 'DELETE_ACCOUNT',
          code,
        });
        await api.auth.deleteAccount({ verificationToken });
      }
      // 탈퇴가 확정된 뒤에만 이 기기의 토큰을 정리한다 (서버 쪽 토큰은 탈퇴와 함께 삭제된다)
      await unregisterPush();
      await useAuthStore.getState().clear();
      router.replace('/home');
      Alert.alert(tr('deleteAccount.doneTitle'), tr('deleteAccount.doneMessage'));
    } catch (e) {
      // 소셜 인증 결과는 한 번만 쓸 수 있다 — 실패하면 다시 확인받는다
      setProof(null);
      setError(errMsg(e));
    } finally {
      setPending(false);
    }
  };
  const confirm = () =>
    Alert.alert(tr('deleteAccount.confirmTitle'), tr('deleteAccount.confirmMessage'), [
      { text: tr('common:action.cancel'), style: 'cancel' },
      { text: tr('deleteAccount.submit'), style: 'destructive', onPress: () => void remove() },
    ]);

  const ready = !!proof || (user.hasPassword ? !!password : code.length === 6);
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: tr('common:screen.deleteAccount') }} />
      <Text color="muted">{tr('deleteAccount.notice')}</Text>
      {user.hasPassword && (
        <Field
          label={tr('deleteAccount.password')}
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
      )}
      {useCode && (
        <>
          <Button
            title={codeSent ? tr('deleteAccount.codeSent') : tr('deleteAccount.sendCode')}
            variant="outline"
            disabled={codeSent}
            onPress={() => void sendCode()}
          />
          <Field
            label={tr('deleteAccount.code')}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
          />
        </>
      )}
      {socials.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text variant="label" color="muted">
            {user.hasPassword || useCode ? tr('deleteAccount.socialOr') : tr('deleteAccount.socialTitle')}
          </Text>
          {proof ? (
            <Text accessibilityLiveRegion="polite">
              {tr('deleteAccount.socialVerified', { provider: label('authProvider', proof.provider) })}
            </Text>
          ) : (
            socials.map((p) => (
              <Button
                key={p}
                title={tr('deleteAccount.socialVerify', { provider: label('authProvider', p) })}
                variant="outline"
                loading={verifying === p}
                disabled={!!verifying}
                onPress={() => void verifySocial(p)}
              />
            ))
          )}
        </View>
      )}
      {!user.hasPassword && !useCode && !socials.length && !providers.isPending && (
        // 확인할 방법이 없으면(소셜 로그인이 잠시 막힌 경우 등) 고객센터로 안내한다
        <Text variant="small" color="muted">
          {tr('deleteAccount.contactSupport', { email: COMPANY.email })}
        </Text>
      )}
      {error && (
        <Text variant="small" color="destructive" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      )}
      <Button
        title={tr('deleteAccount.submit')}
        variant="destructive"
        size="lg"
        disabled={!ready}
        loading={pending}
        onPress={confirm}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
});
