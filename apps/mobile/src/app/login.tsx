import { ApiError } from '@shop/api-client';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { appDevice } from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 이메일 로그인 (회원가입·소셜 로그인은 인증 화면 PR 에서) */
export default function LoginScreen() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = [
    styles.input,
    t.type('body'),
    {
      color: t.colors.foreground,
      borderColor: t.colors.borderStrong,
      minHeight: t.controlHeight,
      borderRadius: t.radius.sm,
    },
  ];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.auth.login({ email: email.trim(), password, device: appDevice() });
      await useAuthStore.getState().setSession(tokens);
      router.back();
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
        <View style={{ gap: 12, marginTop: 24 }}>
          <TextInput
            accessibilityLabel="이메일"
            placeholder="이메일"
            placeholderTextColor={t.colors.faint}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
            style={input}
          />
          <TextInput
            accessibilityLabel="비밀번호"
            placeholder="비밀번호"
            placeholderTextColor={t.colors.faint}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            style={input}
          />
          {error && (
            <Text variant="small" color="destructive" accessibilityRole="alert">
              {error}
            </Text>
          )}
          <Button
            title="로그인"
            size="lg"
            block
            loading={busy}
            disabled={!email || !password}
            onPress={() => void submit()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 4 },
  input: { borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 14 },
});
