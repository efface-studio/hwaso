'use client';

import { ApiError } from '@shop/api-client';
import { emailSchema, otpCodeSchema, passwordSchema } from '@shop/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api';

type Step = 'email' | 'code' | 'password' | 'done';

const msg = (e: unknown) =>
  e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.';

/** 비밀번호 찾기(재설정) — 이메일 → 인증번호 → 새 비밀번호. 재설정하면 모든 기기에서 로그아웃된다 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (step === 'email') {
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) throw new ApiError(400, 'VALIDATION_FAILED', parsed.error.issues[0]!.message);
        await api.auth.sendCode({ email: parsed.data, purpose: 'RESET_PASSWORD' });
        setEmail(parsed.data);
        setStep('code');
      } else if (step === 'code') {
        if (!otpCodeSchema.safeParse(code).success)
          throw new ApiError(400, 'VALIDATION_FAILED', '6자리 숫자를 입력해주세요.');
        const r = await api.auth.verifyCode({ email, purpose: 'RESET_PASSWORD', code });
        setToken(r.verificationToken);
        setStep('password');
      } else if (step === 'password') {
        const p = passwordSchema.safeParse(password);
        if (!p.success) throw new ApiError(400, 'VALIDATION_FAILED', p.error.issues[0]!.message);
        await api.auth.resetPassword({ verificationToken: token, newPassword: password });
        setStep('done');
      }
    } catch (err) {
      setError(msg(err));
    } finally {
      setPending(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h1">비밀번호를 바꿨어요</h1>
        <p className="text-body text-muted">
          보안을 위해 모든 기기에서 로그아웃했습니다. 새 비밀번호로 로그인해주세요.
        </p>
        <Button asChild size="lg" block>
          <Link href="/login">로그인하기</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div>
        <h1 className="text-h1">비밀번호 찾기</h1>
        <p className="mt-1 text-body text-muted">
          {step === 'email' && '가입한 이메일로 인증번호를 보내드려요.'}
          {step === 'code' &&
            `${email} 로 보낸 6자리 번호를 입력해주세요. 가입된 이메일이 아니면 메일이 가지 않아요.`}
          {step === 'password' && '새 비밀번호를 입력해주세요.'}
        </p>
      </div>
      {error && <Alert tone="destructive">{error}</Alert>}
      {step === 'email' && (
        <Field label="이메일">
          {(p) => (
            <Input
              {...p}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
      )}
      {step === 'code' && (
        <Field label="인증번호">
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="tabular tracking-[0.3em]"
            />
          )}
        </Field>
      )}
      {step === 'password' && (
        <Field label="새 비밀번호" hint="8자 이상, 영문과 숫자를 포함해주세요.">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
      )}
      <Button type="submit" size="lg" block loading={pending}>
        {step === 'password' ? '비밀번호 변경' : '다음'}
      </Button>
      <Link href="/login" className="text-center text-small text-muted hover:text-foreground">
        로그인으로 돌아가기
      </Link>
    </form>
  );
}
