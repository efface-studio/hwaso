'use client';

import { ApiError } from '@shop/api-client';
import { containsProhibited, emailSchema, nicknameSchema, otpCodeSchema } from '@shop/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ConsentChecklist, EMPTY_CONSENT, hasRequiredConsent } from '@/components/auth/consent-checklist';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { logout, safeNext } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';

type Errors = { email?: string; code?: string; nickname?: string; form?: string };

const FAILED = '잠시 문제가 발생했습니다. 다시 시도해주세요.';

/** 서버 검증 오류(details.fields)에 해당 필드가 있는지 */
function hasField(details: Record<string, unknown> | undefined, field: string) {
  const fields = details?.fields;
  return typeof fields === 'object' && fields !== null && field in fields;
}

/**
 * 가입 마무리: 필수 약관에 동의하지 않은 계정(소셜 첫 로그인 등)은 로그인 후 이 화면을 거친다 (ConsentGate).
 * 소셜 계정이 준 이메일·이름을 채워 두고, 이메일이 없거나 바꾸면 인증번호로 확인한다. 닉네임도 여기서 고칠 수 있다.
 * 동의하지 않으려면 로그아웃할 수 있다.
 */
function ConsentForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const setUser = useAuthStore((s) => s.setUser);
  /** 소셜 계정이 준 이메일 (없으면 서버의 임시 주소라 쓰지 않는다) */
  const givenEmail = user && !user.emailMissing ? user.email : '';
  const [email, setEmail] = useState(givenEmail);
  const [code, setCode] = useState('');
  /** 인증번호를 보낸 이메일 — 입력한 이메일이 바뀌면 다시 받는다 */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ email: string; token: string } | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [nickname, setNickname] = useState(user?.profile.nickname ?? '');
  const [consent, setConsent] = useState(EMPTY_CONSENT);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** 사용자 정보가 늦게 오면(새로고침 직후) 받은 값으로 한 번 채운다 */
  const [filledFor, setFilledFor] = useState(user?.id ?? null);

  if (user && filledFor !== user.id) {
    setFilledFor(user.id);
    setEmail(givenEmail);
    setNickname(user.profile.nickname);
  }

  useEffect(() => {
    if (!ready || leaving) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(next)}`);
    else if (!user.consentRequired) router.replace(next);
  }, [ready, user, next, router, leaving]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (!ready || !user?.consentRequired) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="불러오는 중">
        <Spinner className="size-6 text-muted" />
      </div>
    );
  }

  const normalized = email.trim().toLowerCase();
  const emailValid = emailSchema.safeParse(email).success;
  /** 받은 이메일을 그대로 쓰면 인증이 필요 없다 */
  const needsVerify = !givenEmail || normalized !== givenEmail.toLowerCase();
  const isVerified = !needsVerify || verified?.email === normalized;
  const codeSent = needsVerify && sentTo === normalized;

  const sendCode = async () => {
    if (!emailValid) return setErrors((e) => ({ ...e, email: '올바른 이메일 주소를 입력해주세요.' }));
    setSending(true);
    setErrors((e) => ({ ...e, email: undefined, code: undefined }));
    try {
      const r = await api.auth.sendCode({ email: normalized, purpose: 'SIGNUP' });
      setSentTo(normalized);
      setCode('');
      setResendIn(r.retryAfterSec);
    } catch (err) {
      setErrors((e) => ({ ...e, email: err instanceof ApiError ? err.message : FAILED }));
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (!otpCodeSchema.safeParse(code).success)
      return setErrors((e) => ({ ...e, code: '6자리 숫자를 입력해주세요.' }));
    setChecking(true);
    setErrors((e) => ({ ...e, code: undefined }));
    try {
      const r = await api.auth.verifyCode({ email: normalized, purpose: 'SIGNUP', code });
      setVerified({ email: normalized, token: r.verificationToken });
      setCode('');
    } catch (err) {
      setErrors((e) => ({ ...e, code: err instanceof ApiError ? err.message : FAILED }));
    } finally {
      setChecking(false);
    }
  };

  /** 입력창에서 Enter 는 폼 제출 대신 그 칸의 동작(인증번호 받기·확인)을 한다 */
  const onEnter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    fn();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = nicknameSchema.safeParse(nickname);
    if (!n.success) return setErrors({ nickname: n.error.issues[0]!.message });
    if (containsProhibited(n.data)) return setErrors({ nickname: '쓸 수 없는 표현이 들어 있어요.' });
    if (!isVerified) return setErrors({ email: '이메일 인증을 마쳐주세요.' });
    if (!hasRequiredConsent(consent)) return setErrors({ form: '필수 항목에 모두 동의해주세요.' });
    setPending(true);
    setErrors({});
    try {
      setUser(
        await api.auth.consent({
          terms: true,
          privacy: true,
          ageOver14: true,
          marketing: consent.marketing,
          ...(n.data !== user.profile.nickname ? { nickname: n.data } : {}),
          ...(needsVerify && verified ? { emailVerificationToken: verified.token } : {}),
        }),
      );
    } catch (err) {
      if (!(err instanceof ApiError)) return setErrors({ form: FAILED });
      if (err.code === 'NICKNAME_TAKEN' || err.code === 'PROHIBITED_CONTENT')
        setErrors({ nickname: err.message });
      else if (err.code === 'ACCOUNT_EXISTS' || err.code === 'INVALID_TOKEN') {
        // 인증 토큰은 이미 쓰였거나 만료됐다 — 이메일을 다시 인증한다
        setVerified(null);
        setSentTo(null);
        setErrors({
          email:
            err.code === 'ACCOUNT_EXISTS'
              ? '이미 가입된 이메일이에요. 다른 이메일을 입력해주세요.'
              : '인증이 만료됐어요. 인증번호를 다시 받아주세요.',
        });
      } else if (err.code === 'VALIDATION_FAILED' && hasField(err.details, 'email'))
        setErrors({ email: '이메일을 입력해주세요.' });
      else setErrors({ form: err.message });
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    setLeaving(true);
    await logout().catch(() => undefined);
    router.replace('/');
  };

  const emailHint = !needsVerify ? (
    '소셜 계정에서 받은 이메일이에요. 거래 안내를 이 주소로 보내요.'
  ) : isVerified ? (
    <span className="text-success">이메일 인증을 마쳤어요.</span>
  ) : codeSent ? (
    `${normalized} 로 인증번호를 보냈어요.`
  ) : givenEmail ? (
    '다른 이메일을 쓰려면 인증번호로 확인해주세요.'
  ) : (
    '소셜 계정에서 이메일을 받지 못했어요. 거래 안내를 받을 이메일을 인증해주세요.'
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <div>
        <h1 className="text-h1">가입 마무리</h1>
        <p className="mt-1 text-body text-muted">
          화소에서 쓸 이메일과 닉네임을 확인하고 약관에 동의해주세요.
        </p>
      </div>

      {errors.form && <Alert tone="destructive">{errors.form}</Alert>}

      <section aria-labelledby="consent-basic" className="flex flex-col gap-5">
        <h2 id="consent-basic" className="text-label text-muted">
          기본 정보
        </h2>
        <Field label="이메일" hint={emailHint} error={errors.email}>
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((x) => ({ ...x, email: undefined, code: undefined }));
                }}
                onKeyDown={onEnter(() => {
                  if (needsVerify && !isVerified && resendIn <= 0) void sendCode();
                })}
              />
              {needsVerify && !isVerified && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  loading={sending}
                  disabled={!emailValid || (codeSent && resendIn > 0)}
                  onClick={() => void sendCode()}
                >
                  {!codeSent ? '인증번호 받기' : resendIn > 0 ? `다시 받기 (${resendIn}초)` : '다시 받기'}
                </Button>
              )}
            </div>
          )}
        </Field>
        {codeSent && !isVerified && (
          <Field label="인증번호 6자리" hint="10분 동안 유효합니다." error={errors.code}>
            {(p) => (
              <div className="flex gap-2">
                <Input
                  {...p}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={onEnter(() => void verifyCode())}
                  className="tabular tracking-[0.3em]"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  loading={checking}
                  disabled={code.length !== 6}
                  onClick={() => void verifyCode()}
                >
                  인증하기
                </Button>
              </div>
            )}
          </Field>
        )}
        <Field label="닉네임" hint="2–20자, 한글·영문·숫자. 나중에 바꿀 수 있어요." error={errors.nickname}>
          {(p) => (
            <Input
              {...p}
              maxLength={20}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setErrors((x) => ({ ...x, nickname: undefined }));
              }}
            />
          )}
        </Field>
      </section>

      <section aria-labelledby="consent-terms" className="flex flex-col gap-3">
        <h2 id="consent-terms" className="text-label text-muted">
          약관 동의
        </h2>
        <ConsentChecklist value={consent} onChange={setConsent} />
      </section>

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          block
          loading={pending}
          disabled={!hasRequiredConsent(consent) || !nickname.trim() || !isVerified}
        >
          동의하고 시작하기
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          block
          disabled={pending}
          onClick={() => void cancel()}
        >
          동의하지 않고 로그아웃
        </Button>
      </div>
    </form>
  );
}

export default function ConsentPage() {
  return (
    <Suspense>
      <ConsentForm />
    </Suspense>
  );
}
