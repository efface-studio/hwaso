import { ApiError } from '@shop/api-client';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { unregisterPush } from '@/lib/push';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했어요.');

/** 회원 탈퇴: 비밀번호(소셜 가입자는 이메일 인증번호)로 본인 확인 후 탈퇴 */
export default function DeleteAccountScreen() {
  const t = useTheme();
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
      // 푸시 토큰은 계정이 있는 동안 해제해야 한다
      await unregisterPush();
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
      await useAuthStore.getState().clear();
      router.replace('/home');
      Alert.alert('탈퇴가 완료되었어요', '그동안 화소를 이용해 주셔서 감사합니다.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setPending(false);
    }
  };
  const confirm = () =>
    Alert.alert(
      '정말 탈퇴하시겠어요?',
      '관심 작품, 판매 중인 작품, 팔로우 정보가 삭제되며 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '탈퇴하기', style: 'destructive', onPress: () => void remove() },
      ],
    );

  const ready = user.hasPassword ? !!password : code.length === 6;
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: '회원 탈퇴' }} />
      <Text color="muted">
        진행 중인 거래·경매가 있으면 탈퇴할 수 없어요. 거래 기록은 관련 법령에 따라 익명으로 보관돼요.
      </Text>
      {user.hasPassword ? (
        <Field
          label="비밀번호 확인"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
      ) : (
        <>
          <Button
            title={codeSent ? '인증번호를 보냈어요' : '이메일로 인증번호 받기'}
            variant="outline"
            disabled={codeSent}
            onPress={() => void sendCode()}
          />
          <Field
            label="인증번호"
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
        title="탈퇴하기"
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
