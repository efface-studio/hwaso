import { ApiError } from '@shop/api-client';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SocialButtons } from '@/components/auth/social-buttons';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { appDevice } from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

export default function LoginScreen() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.auth.login({ email: email.trim(), password, device: appDevice() });
      await useAuthStore.getState().setSession(tokens);
      goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '로그인하지 못했어요. 네트워크를 확인해주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="h2">화소에 오신 걸 환영해요</Text>
        <Text color="muted">작품을 저장하고, 입찰하고, 판매해 보세요.</Text>
        <View style={{ gap: 14, marginTop: 20 }}>
          <Field
            label="이메일"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="비밀번호"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            error={error}
          />
          <Button
            title="로그인"
            size="lg"
            block
            loading={busy}
            disabled={!email || !password}
            onPress={() => void submit()}
          />
          <View style={styles.links}>
            <Link href="/forgot-password" replace>
              <Text variant="small" color="muted">
                비밀번호 찾기
              </Text>
            </Link>
            <Link href="/signup" replace>
              <Text variant="small" color="primary">
                이메일로 가입하기
              </Text>
            </Link>
          </View>
        </View>
        <Text variant="caption" color="muted" style={{ textAlign: 'center', marginVertical: 20 }}>
          간편 로그인
        </Text>
        <SocialButtons onDone={goBack} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 4, paddingBottom: 40 },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
});
