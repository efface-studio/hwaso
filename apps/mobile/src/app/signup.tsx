import { ApiError } from '@shop/api-client';
import { containsProhibited, nicknameSchema, passwordSchema } from '@shop/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type TextInput } from 'react-native';
import { Agreements, NO_AGREEMENT, requiredAgreed } from '@/components/auth/agreements';
import { EmailCodeStep } from '@/components/auth/email-code';
import { nicknameIssueMessage, passwordIssueMessage } from '@/components/auth/validation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormScroll } from '@/components/ui/form-scroll';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { appDevice } from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

/** 회원가입: 이메일 인증 → 비밀번호·닉네임·약관 (이용약관·개인정보·만 14세는 필수, 마케팅은 선택) */
export default function SignupScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'common']);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [agreement, setAgreement] = useState(NO_AGREEMENT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const nicknameRef = useRef<TextInput>(null);

  const submit = async () => {
    const pw = passwordSchema.safeParse(password);
    const nn = nicknameSchema.safeParse(nickname);
    const next: Record<string, string> = {};
    if (!pw.success) next.password = passwordIssueMessage(pw.error.issues[0]!, password);
    if (!nn.success) next.nickname = nicknameIssueMessage(nn.error.issues[0]!);
    else if (containsProhibited(nn.data)) next.nickname = tr('common:validation.prohibited');
    setErrors(next);
    if (Object.keys(next).length || !token) return;
    setBusy(true);
    try {
      const tokens = await api.auth.signup({
        verificationToken: token,
        password,
        nickname: nn.data!,
        agreeTerms: true,
        agreePrivacy: true,
        ageOver14: true,
        agreeMarketing: agreement.marketing,
        device: appDevice(),
      });
      // 로그인 상태가 되면 루트 가드가 로그인·가입 화면을 빼서 보던 화면으로 돌아간다
      await useAuthStore.getState().setSession(tokens);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NICKNAME_TAKEN') setErrors({ nickname: e.message });
      else setErrors({ form: e instanceof ApiError ? e.message : tr('signup.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScroll style={{ backgroundColor: t.colors.background }} contentContainerStyle={styles.body}>
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
            returnKeyType="next"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => nicknameRef.current?.focus()}
            error={errors.password}
            hint={tr('signup.passwordHint')}
          />
          <Field
            ref={nicknameRef}
            label={tr('signup.nickname')}
            autoCapitalize="none"
            value={nickname}
            onChangeText={setNickname}
            error={errors.nickname}
            hint={tr('signup.nicknameHint')}
            maxLength={20}
          />
          <Agreements value={agreement} onChange={setAgreement} />
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
            disabled={!requiredAgreed(agreement) || !password || !nickname}
            onPress={() => void submit()}
          />
        </View>
      )}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 40 },
});
