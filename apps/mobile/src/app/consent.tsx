import { ApiError } from '@shop/api-client';
import { containsProhibited, emailSchema, nicknameSchema } from '@shop/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Agreements, NO_AGREEMENT, requiredAgreed } from '@/components/auth/agreements';
import { nicknameIssueMessage } from '@/components/auth/validation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api, logout } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Errors = { email?: string; code?: string; nickname?: string; form?: string };

/**
 * 가입 마무리: 소셜로 처음 로그인했거나 약관이 바뀌어 필수 동의가 남은 계정 (user.consentRequired).
 * 소셜 계정이 준 이메일·이름을 채워 두고, 이메일이 없거나 바꾸면 인증번호로 확인한다. 닉네임도 여기서 고칠 수 있다.
 * 루트 가드가 이 화면만 열어 둔다. 마치면 가드가 바뀌며 홈으로, 동의하지 않으면 로그아웃한다.
 */
export default function ConsentScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['auth', 'common']);
  const user = useAuthStore((s) => s.user);
  /** 소셜 계정이 준 이메일 (없으면 서버의 임시 주소라 쓰지 않는다) */
  const givenEmail = user && !user.emailMissing ? user.email : '';
  const [email, setEmail] = useState(givenEmail);
  const [code, setCode] = useState('');
  /** 인증번호를 보낸 이메일 — 입력한 이메일이 바뀌면 다시 받는다 */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ email: string; token: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [nickname, setNickname] = useState(user?.profile.nickname ?? '');
  const [agreement, setAgreement] = useState(NO_AGREEMENT);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!user) return null;

  const normalized = email.trim().toLowerCase();
  const emailValid = emailSchema.safeParse(email).success;
  /** 받은 이메일을 그대로 쓰면 인증이 필요 없다 */
  const needsVerify = !givenEmail || normalized !== givenEmail.toLowerCase();
  const isVerified = !needsVerify || verified?.email === normalized;
  const codeSent = needsVerify && sentTo === normalized;

  const changeEmail = (v: string) => {
    setEmail(v);
    setCode('');
    setErrors((e) => ({ ...e, email: undefined, code: undefined }));
  };

  const sendCode = async () => {
    if (!emailValid) return setErrors((e) => ({ ...e, email: tr('consent.emailInvalid') }));
    setSending(true);
    setErrors((e) => ({ ...e, email: undefined, code: undefined }));
    try {
      const r = await api.auth.sendCode({ email: normalized, purpose: 'SIGNUP' });
      setSentTo(normalized);
      setCooldown(r.retryAfterSec);
    } catch (e) {
      setErrors((x) => ({ ...x, email: e instanceof ApiError ? e.message : tr('emailCode.sendFailed') }));
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    setChecking(true);
    setErrors((e) => ({ ...e, code: undefined }));
    try {
      const r = await api.auth.verifyCode({ email: normalized, purpose: 'SIGNUP', code: code.trim() });
      setVerified({ email: normalized, token: r.verificationToken });
      setCode('');
    } catch (e) {
      setErrors((x) => ({ ...x, code: e instanceof ApiError ? e.message : tr('emailCode.verifyFailed') }));
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    const nn = nicknameSchema.safeParse(nickname);
    if (!nn.success) return setErrors({ nickname: nicknameIssueMessage(nn.error.issues[0]!) });
    if (containsProhibited(nn.data)) return setErrors({ nickname: tr('common:validation.prohibited') });
    if (!isVerified) return setErrors({ email: tr('consent.verifyRequired') });
    setBusy(true);
    setErrors({});
    try {
      const me = await api.auth.consent({
        terms: true,
        privacy: true,
        ageOver14: true,
        marketing: agreement.marketing,
        ...(nn.data !== user.profile.nickname ? { nickname: nn.data } : {}),
        ...(needsVerify && verified ? { emailVerificationToken: verified.token } : {}),
      });
      useAuthStore.getState().setUser(me);
    } catch (e) {
      if (!(e instanceof ApiError)) return setErrors({ form: tr('consent.failed') });
      if (e.code === 'NICKNAME_TAKEN') setErrors({ nickname: tr('consent.nicknameTaken') });
      else if (e.code === 'PROHIBITED_CONTENT') setErrors({ nickname: tr('common:validation.prohibited') });
      else if (e.code === 'ACCOUNT_EXISTS') {
        // 이 이메일은 쓸 수 없고, 인증 토큰도 이미 쓰였다 — 다른 이메일로 다시 인증한다
        setVerified(null);
        setSentTo(null);
        setErrors({ email: tr('consent.emailTaken') });
      } else if (e.code === 'INVALID_TOKEN') {
        setVerified(null);
        setSentTo(null);
        setErrors({ email: tr('consent.verifyAgain') });
      } else if (e.code === 'VALIDATION_FAILED' && hasField(e.details, 'email'))
        setErrors({ email: tr('consent.emailRequired') });
      else setErrors({ form: e.message });
    } finally {
      setBusy(false);
    }
  };

  const ready = requiredAgreed(agreement) && !!nickname.trim() && isVerified;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <ScrollView
        // 기본은 한 화면에 들어가고, 작은 폰에서는 내용이 넘치면 스크롤된다 (버튼은 아래에 붙는다)
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <Text color="muted">{tr('consent.description')}</Text>

          <View style={styles.section}>
            <Field
              label={tr('emailCode.email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={changeEmail}
              error={errors.email}
              hint={
                !needsVerify
                  ? undefined
                  : isVerified
                    ? undefined
                    : givenEmail
                      ? tr('consent.emailChanged')
                      : tr('consent.emailMissing')
              }
            />
            {needsVerify && isVerified && (
              <Text variant="small" color="success" accessibilityLiveRegion="polite">
                {tr('consent.verified')}
              </Text>
            )}
            {needsVerify && !isVerified && !codeSent && (
              <Button
                title={tr('emailCode.send')}
                variant="outline"
                loading={sending}
                disabled={!emailValid}
                onPress={() => void sendCode()}
              />
            )}
            {codeSent && !isVerified && (
              <>
                <Text variant="small" color="muted">
                  {tr('emailCode.sentGuide', { email: normalized })}
                </Text>
                <Field
                  label={tr('emailCode.code')}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  error={errors.code}
                />
                <View style={styles.row}>
                  <Button
                    title={
                      cooldown > 0 ? tr('emailCode.resendIn', { seconds: cooldown }) : tr('emailCode.resend')
                    }
                    variant="ghost"
                    disabled={cooldown > 0 || sending || checking}
                    loading={sending}
                    onPress={() => void sendCode()}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={tr('consent.verify')}
                    variant="outline"
                    loading={checking}
                    disabled={code.length !== 6}
                    onPress={() => void verifyCode()}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            )}
            <Field
              label={tr('signup.nickname')}
              autoCapitalize="none"
              counter
              maxLength={20}
              value={nickname}
              onChangeText={(v) => {
                setNickname(v);
                setErrors((e) => ({ ...e, nickname: undefined }));
              }}
              error={errors.nickname}
            />
          </View>

          <Agreements value={agreement} onChange={setAgreement} />
        </View>

        {errors.form && (
          <Text variant="small" color="destructive" accessibilityLiveRegion="polite">
            {errors.form}
          </Text>
        )}
        <View style={{ gap: 8 }}>
          <Button
            title={tr('consent.submit')}
            size="lg"
            block
            loading={busy}
            disabled={!ready}
            onPress={() => void submit()}
          />
          <Button
            title={tr('consent.decline')}
            variant="ghost"
            size="sm"
            block
            onPress={() => void logout()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 서버 검증 오류(details.fields)에 해당 필드가 있는지 */
function hasField(details: Record<string, unknown> | undefined, field: string) {
  const fields = details?.fields;
  return typeof fields === 'object' && fields !== null && field in fields;
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, gap: 20 },
  top: { gap: 16 },
  section: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
});
