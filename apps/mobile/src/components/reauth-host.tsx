import { ApiError } from '@shop/api-client';
import type { ReauthResult } from '@shop/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { biometricKey, useReauth } from '@/lib/reauth';
import { useAuthStore } from '@/stores/auth';

type Mode = 'password' | 'code';

/**
 * 본인 확인 창 (결제·정산 계좌 변경·비밀번호 변경·탈퇴 전에 서버가 요구할 때).
 * 생체 인증 키가 있으면 바로 Face ID 를 띄우고, 없거나 실패하면 비밀번호 또는 이메일 인증번호로 확인한다.
 * 확인되면 재인증 토큰을 api-client 에 넘겨 막혔던 요청이 그대로 다시 나간다.
 */
export function ReauthHost() {
  const pending = useReauth((s) => s.pending);
  if (!pending) return null;
  return <ReauthSheet resolve={pending} />;
}

function ReauthSheet({ resolve }: { resolve: (token: string | null) => void }) {
  const { t: tr } = useTranslation('my');
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<Mode>(user?.hasPassword ? 'password' : 'code');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBiometric, setHasBiometric] = useState(false);
  const tried = useRef(false);

  const done = (r: ReauthResult) => {
    api.setReauthToken(r.reauthToken, r.expiresAt);
    resolve(r.reauthToken);
  };
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : tr('security.failed'));

  const biometric = async () => {
    setError(null);
    const key = await biometricKey.unlock(tr('security.biometricPrompt'));
    // 취소했거나 얼굴·지문을 다시 등록해 키가 무효가 됐다 — 아래 다른 방법으로 확인한다
    if (!key) return;
    setBusy(true);
    try {
      done(await api.auth.reauth({ method: 'biometric', keyId: key.keyId, secret: key.secret }));
    } catch (e) {
      // 서버에서 키가 사라졌다 (기기 로그아웃 등) — 이 기기 키도 지운다
      if (e instanceof ApiError && e.status === 401) {
        await biometricKey.clear();
        setHasBiometric(false);
        setError(tr('security.biometricChanged'));
      } else fail(e);
    } finally {
      setBusy(false);
    }
  };

  // 창이 뜨면 생체 인증부터 (한 번만)
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    void biometricKey.id().then((id) => {
      setHasBiometric(!!id);
      if (id) void biometric();
    });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submitPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      done(await api.auth.reauth({ method: 'password', password }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.sendReauthCode();
      setSent(true);
      setCooldown(r.retryAfterSec);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    try {
      done(await api.auth.reauth({ method: 'otp', code: code.trim() }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={tr('security.title')} onClose={() => resolve(null)}>
      <Text color="muted">{tr('security.description')}</Text>

      {hasBiometric && (
        <Button
          title={tr('security.biometricButton')}
          variant="secondary"
          block
          disabled={busy}
          onPress={() => void biometric()}
        />
      )}

      {mode === 'password' ? (
        <View style={{ gap: 12 }}>
          <Field
            label={tr('security.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={() => password && void submitPassword()}
            error={error}
          />
          <Button
            title={tr('security.confirm')}
            block
            loading={busy}
            disabled={!password}
            onPress={() => void submitPassword()}
          />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {sent && (
            <Text variant="small" color="muted">
              {tr('security.codeSent', { email: user?.email ?? '' })}
            </Text>
          )}
          {sent && (
            <Field
              label={tr('security.code')}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
              textContentType="oneTimeCode"
              maxLength={6}
              error={error}
            />
          )}
          {!sent && error && (
            <Text variant="small" color="destructive" accessibilityRole="alert">
              {error}
            </Text>
          )}
          {sent ? (
            <Button
              title={tr('security.confirm')}
              block
              loading={busy}
              disabled={code.length !== 6}
              onPress={() => void submitCode()}
            />
          ) : null}
          <Button
            title={cooldown > 0 ? tr('security.resend', { seconds: cooldown }) : tr('security.sendCode')}
            variant={sent ? 'ghost' : 'primary'}
            block
            loading={busy && !sent}
            disabled={cooldown > 0 || busy}
            onPress={() => void sendCode()}
          />
        </View>
      )}

      {user?.hasPassword && (
        <Button
          title={mode === 'password' ? tr('security.useCode') : tr('security.usePassword')}
          variant="ghost"
          block
          onPress={() => {
            setError(null);
            setMode(mode === 'password' ? 'code' : 'password');
          }}
        />
      )}
    </Sheet>
  );
}
