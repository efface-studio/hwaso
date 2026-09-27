'use client';

import { ApiError } from '@shop/api-client';
import { AUTH_PROVIDERS, nicknameSchema, passwordSchema, type AuthProvider } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { PROVIDER_LABEL, useAuthProviders } from '@/components/auth/social-buttons';
import { ThemeSelect } from '@/components/layout/theme-select';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Badge } from '@/components/ui/display';
import { Field, Input, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api';
import { safeNext, startOAuth } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

const msg = (e: unknown) =>
  e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.';

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-border py-8 first:border-t-0 first:pt-0">
      <h2 className="text-h3">{title}</h2>
      {description && <p className="mt-1 text-small text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileSection() {
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);
  const [nickname, setNickname] = useState(user.profile.nickname);
  const [bio, setBio] = useState(user.profile.bio);
  const [region, setRegion] = useState(user.profile.region ?? '');
  const [avatarKey, setAvatarKey] = useState(user.profile.avatarKey);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const img = await api.market.uploadImage(f, f.name);
      setAvatarKey(img.key);
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = nicknameSchema.safeParse(nickname);
    if (!n.success) return setError(n.error.issues[0]!.message);
    setPending(true);
    setError(null);
    try {
      setUser(await api.auth.updateProfile({ nickname: n.data, bio, region: region || null, avatarKey }));
      toast.success('프로필을 저장했어요');
    } catch (err) {
      setError(msg(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="destructive">{error}</Alert>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="relative"
          aria-label="프로필 사진 변경"
        >
          <Avatar avatarKey={avatarKey} name={nickname} size="xl" />
          <span className="absolute right-0 bottom-0 inline-flex size-8 items-center justify-center rounded-full border border-border bg-background">
            <Camera className="size-4" aria-hidden />
          </span>
        </button>
        <div className="flex flex-col gap-1 text-small text-muted">
          {uploading ? '올리는 중…' : 'JPG, PNG, WebP, HEIC · 20MB 이하'}
          {avatarKey && (
            <button type="button" onClick={() => setAvatarKey(null)} className="self-start text-destructive">
              사진 삭제
            </button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
      </div>
      <Field label="닉네임">
        {(p) => (
          <Input {...p} maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        )}
      </Field>
      <Field label="소개" hint="판매자 프로필에 표시돼요.">
        {(p) => <Textarea {...p} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} />}
      </Field>
      <Field label="거래 지역">
        {(p) => (
          <Input
            {...p}
            maxLength={50}
            placeholder="예) 서울 종로구"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" loading={pending} className="self-end">
        저장
      </Button>
    </form>
  );
}

function PasswordSection() {
  const user = useAuthStore((s) => s.user)!;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setUser = useAuthStore((s) => s.setUser);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const p = passwordSchema.safeParse(next);
    if (!p.success) return setError(p.error.issues[0]!.message);
    setPending(true);
    setError(null);
    try {
      await api.auth.changePassword({ currentPassword: user.hasPassword ? current : '-', newPassword: next });
      setCurrent('');
      setNext('');
      setUser({ ...user, hasPassword: true });
      toast.success('비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됩니다.');
    } catch (err) {
      setError(msg(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="destructive">{error}</Alert>}
      {user.hasPassword && (
        <Field label="현재 비밀번호">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
      )}
      <Field label="새 비밀번호" hint="8자 이상, 영문과 숫자를 포함해주세요.">
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="secondary" loading={pending} className="self-end">
        {user.hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
      </Button>
    </form>
  );
}

function SocialSection() {
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);
  const { data } = useAuthProviders();
  const available = AUTH_PROVIDERS.filter((p) => data?.oauth.includes(p) || user.socialProviders.includes(p));
  if (!available.length)
    return <p className="text-small text-muted">사용할 수 있는 소셜 로그인이 없습니다.</p>;

  const unlink = async (p: AuthProvider) => {
    try {
      await api.auth.unlinkSocial(p);
      setUser({ ...user, socialProviders: user.socialProviders.filter((x) => x !== p) });
      toast.show(`${PROVIDER_LABEL[p]} 연결을 해제했어요`);
    } catch (e) {
      toast.error(msg(e));
    }
  };

  return (
    <ul className="divide-y divide-border-soft">
      {available.map((p) => {
        const linked = user.socialProviders.includes(p);
        return (
          <li key={p} className="flex h-14 items-center justify-between">
            <span className="flex items-center gap-2 text-body">
              {PROVIDER_LABEL[p]}
              {linked && <Badge tone="primary">연결됨</Badge>}
            </span>
            {linked ? (
              <Button variant="ghost" size="sm" onClick={() => void unlink(p)}>
                연결 해제
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void startOAuth(p, 'link').catch((e) => toast.error(msg(e)))}
              >
                연결하기
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function IdentitySection() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);
  const providers = useAuthProviders();
  const status = useQuery({ queryKey: ['identity'], queryFn: api.auth.identity });
  const [pending, setPending] = useState(false);

  if (status.data?.verified) {
    return (
      <div className="flex items-center justify-between rounded-sm border border-border p-4">
        <div>
          <p className="flex items-center gap-2 text-body-strong">
            본인인증 완료 <Badge tone="primary">PASS</Badge>
          </p>
          <p className="text-small text-muted">
            {status.data.nameMasked} · {status.data.phoneMasked} · {status.data.isAdult ? '성인' : '미성년'}
          </p>
        </div>
      </div>
    );
  }
  const verify = async () => {
    // 키가 없는 개발 환경에서도 화면은 보이게 두고, 눌렀을 때 안내한다
    if (!providers.data?.identity) {
      toast.show('PASS 본인인증은 PortOne 키 설정 후 사용할 수 있어요 (apps/api/.env)');
      return;
    }
    setPending(true);
    try {
      const prep = await api.auth.prepareIdentity();
      const PortOne = await import('@portone/browser-sdk/v2');
      const res = await PortOne.requestIdentityVerification({
        storeId: prep.storeId,
        channelKey: prep.channelKey,
        identityVerificationId: prep.identityVerificationId,
        // 모바일 브라우저는 리다이렉트 방식으로 돌아온다
        redirectUrl: `${window.location.origin}/my/settings?identityVerificationId=${prep.identityVerificationId}#identity`,
      });
      if (!res || res.code) {
        if (res?.message) toast.error(res.message);
        return;
      }
      await api.auth.completeIdentity(prep.identityVerificationId);
      setUser({ ...user, identityVerified: true });
      await qc.invalidateQueries({ queryKey: ['identity'] });
      toast.success('본인인증을 완료했어요');
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-muted">
        휴대폰 PASS 인증으로 명의를 확인합니다. 인증 정보는 중복 가입 방지를 위한 값만 안전하게 보관됩니다.
      </p>
      <Button onClick={() => void verify()} loading={pending} className="self-start">
        PASS 본인인증
      </Button>
    </div>
  );
}

function DeleteSection() {
  const user = useAuthStore((s) => s.user)!;
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      if (user.hasPassword) {
        await api.auth.deleteAccount({ password });
      } else {
        const { verificationToken } = await api.auth.verifyCode({
          email: user.email,
          purpose: 'DELETE_ACCOUNT',
          code,
        });
        await api.auth.deleteAccount({ verificationToken });
      }
      clear();
      router.replace('/');
      toast.show('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.');
    } catch (e) {
      setError(msg(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <p className="text-small text-muted">
        진행 중인 거래·경매가 있으면 탈퇴할 수 없어요. 거래 기록은 관련 법령에 따라 익명으로 보관됩니다.
      </p>
      <Button variant="ghost" className="mt-3 text-destructive" onClick={() => setOpen(true)}>
        회원 탈퇴
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="정말 탈퇴하시겠어요?"
        description="관심 작품, 판매 중인 작품, 팔로우 정보가 삭제되며 되돌릴 수 없습니다."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" loading={pending} onClick={() => void confirm()}>
              탈퇴하기
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Alert tone="destructive">{error}</Alert>}
          {user.hasPassword ? (
            <Field label="비밀번호 확인">
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={codeSent}
                onClick={async () => {
                  try {
                    await api.auth.sendCode({ email: user.email, purpose: 'DELETE_ACCOUNT' });
                    setCodeSent(true);
                  } catch (e) {
                    setError(msg(e));
                  }
                }}
              >
                {codeSent ? '인증번호를 보냈어요' : '이메일로 인증번호 받기'}
              </Button>
              <Field label="인증번호">
                {(p) => (
                  <Input
                    {...p}
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                )}
              </Field>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}

/** 모바일 PASS 는 리다이렉트로 돌아온다 — 쿼리의 인증 ID 로 완료 처리 */
function IdentityRedirectHandler() {
  const params = useSearchParams();
  const id = params.get('identityVerificationId');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  const handled = useRef(false);
  useEffect(() => {
    if (!id || !user || handled.current) return;
    handled.current = true;
    api.auth
      .completeIdentity(id)
      .then(() => {
        setUser({ ...user, identityVerified: true });
        void qc.invalidateQueries({ queryKey: ['identity'] });
        toast.success('본인인증을 완료했어요');
      })
      .catch((e) => toast.error(msg(e)));
  }, [id, user, setUser, qc]);
  return null;
}

function Settings() {
  const params = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const next = safeNext(params.get('next'));
  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <IdentityRedirectHandler />
      <h1 className="mb-6 text-h1">설정</h1>
      {welcome && (
        <Alert tone="success" title="가입을 환영합니다" className="mb-6">
          닉네임이 자동으로 정해졌어요. 원하는 닉네임으로 바꿔보세요.{' '}
          <Link href={next} className="font-semibold text-foreground underline underline-offset-2">
            건너뛰기
          </Link>
        </Alert>
      )}
      <Section title="프로필">
        <ProfileSection />
      </Section>
      <Section title="화면">
        <div className="flex items-center justify-between">
          <span className="text-body">테마</span>
          <ThemeSelect />
        </div>
      </Section>
      <Section id="identity" title="본인인증">
        <IdentitySection />
      </Section>
      <Section title="배송지 · 알림 · 안전">
        {(
          [
            ['/my/settings/addresses', '배송지 관리'],
            ['/my/settings/notifications', '알림 설정'],
            ['/my/settings/blocks', '차단한 사용자'],
            ['/my/reports', '신고 내역'],
          ] as const
        ).map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="flex h-14 items-center justify-between border-b border-border-soft last:border-0"
          >
            <span className="text-body">{label}</span>
            <ChevronRight className="size-4 text-faint" aria-hidden />
          </Link>
        ))}
      </Section>
      <Section title="로그인 · 보안">
        <PasswordSection />
        <Link
          href="/my/settings/devices"
          className="mt-6 flex h-14 items-center justify-between border-t border-border-soft"
        >
          <span className="text-body">로그인된 기기 관리</span>
          <ChevronRight className="size-4 text-faint" aria-hidden />
        </Link>
      </Section>
      <Section title="연결된 소셜 계정" description="연결하면 해당 계정으로도 로그인할 수 있어요.">
        <SocialSection />
      </Section>
      <Section title="회원 탈퇴">
        <DeleteSection />
      </Section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Suspense>
        <Settings />
      </Suspense>
    </RequireAuth>
  );
}
