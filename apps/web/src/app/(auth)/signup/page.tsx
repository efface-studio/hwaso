'use client';

import { ApiError } from '@shop/api-client';
import { emailSchema, nicknameSchema, otpCodeSchema, passwordSchema } from '@shop/shared';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { ConsentChecklist, EMPTY_CONSENT, hasRequiredConsent } from '@/components/auth/consent-checklist';
import { Button } from '@/components/ui/button';
import { Alert, Progress } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api';
import { completeLogin, safeNext } from '@/lib/auth';
import { webDevice } from '@/lib/device';

type Step = 'email' | 'code' | 'password' | 'profile' | 'done';
const STEPS: Step[] = ['email', 'code', 'password', 'profile'];
const TITLE: Record<Step, string> = {
  email: '이메일을 입력해주세요',
  code: '인증번호를 입력해주세요',
  password: '비밀번호를 만들어주세요',
  profile: '닉네임을 정해주세요',
  done: '가입을 환영합니다',
};

const msg = (e: unknown) =>
  e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.';

/** 이메일 → 인증 → 비밀번호 → 기본 프로필 → 완료. 처음부터 많은 정보를 묻지 않는다 (요구사항 §6) */
function SignupFlow() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(EMPTY_CONSENT);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setPending(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) throw new ApiError(400, 'VALIDATION_FAILED', parsed.error.issues[0]!.message);
      await api.auth.sendCode({ email: parsed.data, purpose: 'SIGNUP' });
      setEmail(parsed.data);
      setResendIn(60);
      setStep('code');
    });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'email') return void sendCode();
    if (step === 'code') {
      return void run(async () => {
        const c = otpCodeSchema.safeParse(code);
        if (!c.success) throw new ApiError(400, 'VALIDATION_FAILED', c.error.issues[0]!.message);
        const r = await api.auth.verifyCode({ email, purpose: 'SIGNUP', code });
        setToken(r.verificationToken);
        setStep('password');
      });
    }
    if (step === 'password') {
      const p = passwordSchema.safeParse(password);
      if (!p.success) return setError(p.error.issues[0]!.message);
      if (password !== confirm) return setError('비밀번호가 서로 다릅니다.');
      if (!hasRequiredConsent(consent)) return setError('필수 항목에 모두 동의해주세요.');
      setError(null);
      return setStep('profile');
    }
    if (step === 'profile') {
      return void run(async () => {
        const n = nicknameSchema.safeParse(nickname);
        if (!n.success) throw new ApiError(400, 'VALIDATION_FAILED', n.error.issues[0]!.message);
        const tokens = await api.auth.signup({
          verificationToken: token,
          password,
          nickname: n.data,
          agreeTerms: true,
          agreePrivacy: true,
          ageOver14: true,
          agreeMarketing: consent.marketing,
          device: webDevice(),
        });
        completeLogin(tokens);
        setStep('done');
      });
    }
  };

  const index = STEPS.indexOf(step);
  const back = () => {
    setError(null);
    setStep(STEPS[Math.max(0, index - 1)]!);
  };

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h1">{TITLE.done}</h1>
        <p className="text-body text-muted">
          {nickname}님, 이제 작품을 저장하고 입찰할 수 있어요. 작품을 판매하려면 판매자 등록을 해주세요.
        </p>
        <div className="flex flex-col gap-2">
          <Button size="lg" block onClick={() => router.replace(next)}>
            둘러보기
          </Button>
          <Button size="lg" block variant="outline" onClick={() => router.replace('/sell')}>
            작품 판매하기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {index > 0 && step !== 'password' ? (
            <button
              type="button"
              onClick={back}
              aria-label="이전 단계"
              className="-ml-2 rounded-sm p-2 hover:bg-surface-2"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          ) : null}
          <span className="text-caption text-muted">
            {index + 1} / {STEPS.length}
          </span>
        </div>
        <Progress value={((index + 1) / STEPS.length) * 100} label="가입 진행률" />
        <h1 className="text-h1">{TITLE[step]}</h1>
      </div>

      {error && <Alert tone="destructive">{error}</Alert>}

      {step === 'email' && (
        <Field label="이메일" hint="인증번호를 보내드릴게요.">
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
        <>
          <Field label="인증번호 6자리" hint={`${email} 로 보낸 번호를 입력해주세요. 10분 동안 유효합니다.`}>
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
          <button
            type="button"
            disabled={resendIn > 0 || pending}
            onClick={() => void sendCode()}
            className="self-start text-small text-muted underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60"
          >
            {resendIn > 0 ? `인증번호 다시 받기 (${resendIn}초)` : '인증번호 다시 받기'}
          </button>
        </>
      )}

      {step === 'password' && (
        <>
          <Field label="비밀번호" hint="8자 이상, 영문과 숫자를 포함해주세요.">
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
          <Field label="비밀번호 확인">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
          </Field>
          <div className="border-t border-border pt-2">
            <ConsentChecklist value={consent} onChange={setConsent} />
          </div>
        </>
      )}

      {step === 'profile' && (
        <Field label="닉네임" hint="2–20자, 한글·영문·숫자. 나중에 바꿀 수 있어요.">
          {(p) => (
            <Input
              {...p}
              autoFocus
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          )}
        </Field>
      )}

      <Button type="submit" size="lg" block loading={pending}>
        {step === 'profile' ? '가입 완료' : '다음'}
      </Button>

      {step === 'email' && (
        <p className="text-center text-small text-muted">
          이미 계정이 있나요?{' '}
          <Link href="/login" className="font-semibold text-primary">
            로그인
          </Link>
        </p>
      )}
    </form>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupFlow />
    </Suspense>
  );
}
