import { ApiError } from '@shop/api-client';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { api } from '@/lib/api';
import { unregisterPush } from '@/lib/push';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('common:state.actionFailed'));

/** 회원 탈퇴: 비밀번호(소셜 가입자는 이메일 인증번호)로 본인 확인 후 탈퇴 */
export default function DeleteAccountScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['my', 'common']);
  const user = useAuthStore((s) => s.user);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const sendCode = async () => {
    try {
      await api.auth.sendCode({ email: user.email, purpose: 'DELETE_ACCOUNT' });
      setCodeSent(true);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      if (user.hasPassword) {
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

  const ready = user.hasPassword ? !!password : code.length === 6;
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: tr('common:screen.deleteAccount') }} />
      <Text color="muted">{tr('deleteAccount.notice')}</Text>
      {user.hasPassword ? (
        <Field
          label={tr('deleteAccount.password')}
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
      ) : (
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
