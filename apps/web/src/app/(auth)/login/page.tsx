'use client';

import { ApiError } from '@shop/api-client';
import { loginSchema } from '@shop/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { SocialButtons } from '@/components/auth/social-buttons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/choice';
import { Alert } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api';
import {
  completeLogin,
  keepSignedIn,
  safeNext,
  savedEmail,
  setKeepSignedIn,
  setSavedEmail,
} from '@/lib/auth';
import { webDevice } from '@/lib/device';
import { useAuthStore } from '@/stores/auth';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const user = useAuthStore((s) => s.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(params.get('error'));
  const [pending, setPending] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [keep, setKeep] = useState(true);

  // 저장한 아이디와 로그인 상태 유지 선택은 이 브라우저(localStorage)에만 둔다
  useEffect(() => {
    const saved = savedEmail();
    if (saved) {
      setEmail((cur) => cur || saved);
      setRememberEmail(true);
    }
    setKeep(keepSignedIn());
  }, []);

  // 이미 로그인한 상태면 돌려보낸다
  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password, device: webDevice() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const tokens = await api.auth.login(parsed.data);
      setSavedEmail(rememberEmail ? parsed.data.email : null);
      completeLogin(tokens);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-h1">로그인</h1>
        <p className="mt-1 text-body text-muted">작품을 저장하고, 입찰하고, 판매해 보세요.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="destructive">{error}</Alert>}
        <Field label="이메일">
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>
        <Field label="비밀번호">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox
            checked={rememberEmail}
            onCheckedChange={setRememberEmail}
            label="아이디 저장"
            className="text-small"
          />
          <Checkbox
            checked={keep}
            onCheckedChange={(v) => {
              setKeep(v);
              setKeepSignedIn(v);
            }}
            label="로그인 상태 유지"
            className="text-small"
          />
        </div>
        <Button type="submit" size="lg" block loading={pending}>
          로그인
        </Button>
        <div className="flex justify-between text-small">
          <Link href="/forgot-password" className="text-muted hover:text-foreground">
            비밀번호 찾기
          </Link>
          <Link
            href={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold text-primary"
          >
            이메일로 가입하기
          </Link>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-caption text-muted">
          <span className="h-px flex-1 bg-border" />
          간편 로그인
          <span className="h-px flex-1 bg-border" />
        </div>
        <SocialButtons next={next} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
