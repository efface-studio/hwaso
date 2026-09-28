import { ApiError } from '@shop/api-client';
import type { VerificationPurpose } from '@shop/shared';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';

/** 이메일 → 인증번호 → verificationToken (가입·비밀번호 찾기 공용) */
export function EmailCodeStep({
  purpose,
  onVerified,
}: {
  purpose: VerificationPurpose;
  onVerified: (email: string, token: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.sendCode({ email: email.trim(), purpose });
      setSent(true);
      setCooldown(r.retryAfterSec);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '인증번호를 보내지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.verifyCode({ email: email.trim(), purpose, code: code.trim() });
      onVerified(email.trim(), r.verificationToken);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '인증하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Field
        label="이메일"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!sent}
        error={!sent ? error : null}
      />
      {!sent ? (
        <Button
          title="인증번호 받기"
          size="lg"
          block
          loading={busy}
          disabled={!email.includes('@')}
          onPress={() => void send()}
        />
      ) : (
        <>
          <Text variant="small" color="muted">
            {email} 로 보낸 6자리 번호를 입력해주세요. 10분 동안 쓸 수 있어요.
          </Text>
          <Field
            label="인증번호"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            error={error}
          />
          <Button
            title="확인"
            size="lg"
            block
            loading={busy}
            disabled={code.length !== 6}
            onPress={() => void verify()}
          />
          <Button
            title={cooldown > 0 ? `다시 받기 (${cooldown}초)` : '인증번호 다시 받기'}
            variant="ghost"
            disabled={cooldown > 0 || busy}
            onPress={() => void send()}
          />
          <Button
            title="이메일 바꾸기"
            variant="ghost"
            onPress={() => {
              setSent(false);
              setCode('');
              setError(null);
            }}
          />
        </>
      )}
    </View>
  );
}
