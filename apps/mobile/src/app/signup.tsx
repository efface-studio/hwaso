import { ApiError } from '@shop/api-client';
import { nicknameSchema, passwordSchema } from '@shop/shared';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { EmailCodeStep } from '@/components/auth/email-code';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { appDevice } from '@/lib/device';
import { env } from '@/lib/env';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 회원가입: 이메일 인증 → 비밀번호·닉네임·약관 */
export default function SignupScreen() {
  const t = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const pw = passwordSchema.safeParse(password);
    const nn = nicknameSchema.safeParse(nickname);
    const next: Record<string, string> = {};
    if (!pw.success) next.password = pw.error.issues[0]!.message;
    if (!nn.success) next.nickname = nn.error.issues[0]!.message;
    setErrors(next);
    if (Object.keys(next).length || !token) return;
    setBusy(true);
    try {
      const tokens = await api.auth.signup({
        verificationToken: token,
        password,
        nickname: nn.data!,
        agreeTerms: true,
        agreeMarketing: marketing,
        device: appDevice(),
      });
      await useAuthStore.getState().setSession(tokens);
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NICKNAME_TAKEN') setErrors({ nickname: e.message });
      else setErrors({ form: e instanceof ApiError ? e.message : '가입하지 못했어요.' });
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
        <Text variant="h2">{token ? '거의 다 됐어요' : '이메일로 가입하기'}</Text>
        {!token ? (
          <EmailCodeStep purpose="SIGNUP" onVerified={(_e, tk) => setToken(tk)} />
        ) : (
          <View style={{ gap: 14 }}>
            <Field
              label="비밀번호"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              hint="8자 이상, 영문·숫자·기호 중 2가지 이상"
            />
            <Field
              label="닉네임"
              autoCapitalize="none"
              value={nickname}
              onChangeText={setNickname}
              error={errors.nickname}
              hint="2~20자, 다른 회원에게 보이는 이름"
              maxLength={20}
            />
            <View style={[styles.row, { minHeight: t.touch }]}>
              <Switch
                value={terms}
                onValueChange={setTerms}
                trackColor={{ true: t.colors.primary }}
                accessibilityLabel="이용약관·개인정보처리방침 동의 (필수)"
              />
              <Text style={{ flex: 1 }}>이용약관·개인정보처리방침 동의 (필수)</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => void WebBrowser.openBrowserAsync(`${env.webUrl}/terms`)}
                hitSlop={8}
              >
                <Text variant="small" color="muted">
                  보기
                </Text>
              </Pressable>
            </View>
            <View style={[styles.row, { minHeight: t.touch }]}>
              <Switch
                value={marketing}
                onValueChange={setMarketing}
                trackColor={{ true: t.colors.primary }}
                accessibilityLabel="이벤트·혜택 알림 받기 (선택)"
              />
              <Text style={{ flex: 1 }}>이벤트·혜택 알림 받기 (선택)</Text>
            </View>
            {errors.form && (
              <Text variant="small" color="destructive">
                {errors.form}
              </Text>
            )}
            <Button
              title="가입하기"
              size="lg"
              block
              loading={busy}
              disabled={!terms || !password || !nickname}
              onPress={() => void submit()}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
