import { ApiError } from '@shop/api-client';
import { passwordSchema } from '@shop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { EmailCodeStep } from '@/components/auth/email-code';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 비밀번호 찾기: 이메일 인증 → 새 비밀번호 (모든 기기에서 로그아웃된다) */
export default function ForgotPasswordScreen() {
  const t = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return setError(pw.error.issues[0]!.message);
    setBusy(true);
    try {
      await api.auth.resetPassword({ verificationToken: token!, newPassword: password });
      Alert.alert('비밀번호를 바꿨어요', '새 비밀번호로 로그인해주세요.', [
        { text: '확인', onPress: () => router.replace('/login') },
      ]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '바꾸지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text variant="h2">비밀번호 찾기</Text>
        {!token ? (
          <EmailCodeStep purpose="RESET_PASSWORD" onVerified={(_e, tk) => setToken(tk)} />
        ) : (
          <View style={{ gap: 14 }}>
            <Field
              label="새 비밀번호"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              error={error}
              hint="8자 이상, 영문·숫자·기호 중 2가지 이상"
            />
            <Button
              title="비밀번호 바꾸기"
              size="lg"
              block
              loading={busy}
              disabled={!password}
              onPress={() => void submit()}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
