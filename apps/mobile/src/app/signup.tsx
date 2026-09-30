import { ApiError } from '@shop/api-client';
import { nicknameSchema, passwordSchema } from '@shop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { nicknameIssueMessage, passwordIssueMessage } from '@/components/auth/validation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { appDevice } from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 회원가입: 이메일 인증 → 비밀번호·닉네임·약관 */
export default function SignupScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('auth');
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
    if (!pw.success) next.password = passwordIssueMessage(pw.error.issues[0]!, password);
    if (!nn.success) next.nickname = nicknameIssueMessage(nn.error.issues[0]!);
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
      // 로그인 상태가 되면 루트 가드가 홈으로 보낸다
      await useAuthStore.getState().setSession(tokens);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NICKNAME_TAKEN') setErrors({ nickname: e.message });
      else setErrors({ form: e instanceof ApiError ? e.message : tr('signup.failed') });
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
        <Text variant="h2">{token ? tr('signup.almostDone') : tr('signup.title')}</Text>
        {!token ? (
          <EmailCodeStep purpose="SIGNUP" onVerified={(_e, tk) => setToken(tk)} />
        ) : (
          <View style={{ gap: 14 }}>
            <Field
              label={tr('signup.password')}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              hint={tr('signup.passwordHint')}
            />
            <Field
              label={tr('signup.nickname')}
              autoCapitalize="none"
              value={nickname}
              onChangeText={setNickname}
              error={errors.nickname}
              hint={tr('signup.nicknameHint')}
              maxLength={20}
            />
            <View style={[styles.row, { minHeight: t.touch }]}>
              <Switch
                value={terms}
                onValueChange={setTerms}
                trackColor={{ true: t.colors.primary }}
                accessibilityLabel={tr('signup.agreeTerms')}
              />
              <Text style={{ flex: 1 }}>{tr('signup.agreeTerms')}</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/policies/[slug]', params: { slug: 'terms' } })}
                hitSlop={8}
              >
                <Text variant="small" color="muted">
                  {tr('signup.viewTerms')}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.row, { minHeight: t.touch }]}>
              <Switch
                value={marketing}
                onValueChange={setMarketing}
                trackColor={{ true: t.colors.primary }}
                accessibilityLabel={tr('signup.agreeMarketing')}
              />
              <Text style={{ flex: 1 }}>{tr('signup.agreeMarketing')}</Text>
            </View>
            {errors.form && (
              <Text variant="small" color="destructive">
                {errors.form}
              </Text>
            )}
            <Button
              title={tr('signup.submit')}
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
