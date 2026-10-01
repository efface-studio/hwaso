'use client';

import { ApiError } from '@shop/api-client';
import {
  SUSPEND_MAX_DAYS,
  SUSPEND_PRESET_DAYS,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  type AdminCreateUserInput,
  type AdminUpdateUserInput,
  type AdminUserDetail,
  type Role,
} from '@shop/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, Switch } from '@/components/ui/choice';
import { DateTimeInput } from '@/components/ui/date-picker';
import { Alert } from '@/components/ui/display';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { dt } from './admin-list';

export const ROLE_LABEL: Record<Role, string> = {
  USER: '일반',
  SELLER: '판매자',
  VERIFIED_SELLER: '인증 판매자',
  ADMIN: '관리자',
  SUPER_ADMIN: '최고 관리자',
};
const INVALIDATE = ['users', 'user', 'sellers'];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Errors = Record<string, string>;

/** zod 이슈 → 필드별 첫 오류 (경로 없는 오류는 '_') */
function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) out[String(i.path[0] ?? '_')] ??= i.message;
  return out;
}

/** 서버 검증 오류의 details.fields (없으면 null) */
function serverFieldErrors(e: unknown): Errors | null {
  if (!(e instanceof ApiError)) return null;
  const fields = e.details?.fields;
  if (!fields || typeof fields !== 'object') return null;
  const out: Errors = {};
  for (const [k, v] of Object.entries(fields)) if (typeof v === 'string') out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** 회원 폼 저장: 목록 무효화 + 필드 오류는 폼에, 그 밖의 오류는 토스트로 */
function useUserFormMutation<V, R>(fn: (v: V) => Promise<R>, onFieldErrors: (e: Errors) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of INVALIDATE) void qc.invalidateQueries({ queryKey: ['admin', k] });
    },
    onError: (e) => {
      const fields = serverFieldErrors(e);
      if (fields) onFieldErrors(fields);
      else toast.error(e instanceof ApiError ? e.message : '처리하지 못했습니다.');
    },
  });
}

/** ISO → DateTimeInput 값 ("YYYY-MM-DDTHH:mm", 로컬) */
const toLocalInput = (iso: string) =>
  new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

// ───── 이용 정지 기간 ─────

export type SuspendPeriod = 'forever' | `${(typeof SUSPEND_PRESET_DAYS)[number]}` | 'custom';
export interface SuspendPeriodValue {
  period: SuspendPeriod;
  /** 직접 선택한 종료 일시 (DateTimeInput 값) */
  custom: string;
}

/** 정지 다이얼로그를 열 때의 기본값: 이미 정지 중이면 지금 기간을 그대로 보여준다 */
export function initialSuspendPeriod(
  u: Pick<AdminUserDetail, 'status' | 'suspendedUntil'>,
): SuspendPeriodValue {
  if (u.status === 'SUSPENDED' && u.suspendedUntil)
    return { period: 'custom', custom: toLocalInput(u.suspendedUntil) };
  return { period: 'forever', custom: '' };
}

/** 제출 시점 기준으로 종료 시각 계산. null 이면 영구 */
export function resolveSuspendUntil(
  v: SuspendPeriodValue,
): { ok: true; until: string | null } | { ok: false; error: string } {
  if (v.period === 'forever') return { ok: true, until: null };
  if (v.period !== 'custom')
    return { ok: true, until: new Date(Date.now() + Number(v.period) * DAY).toISOString() };
  if (!v.custom) return { ok: false, error: '종료 일시를 골라주세요.' };
  const t = new Date(v.custom).getTime();
  if (!Number.isFinite(t) || t <= Date.now()) return { ok: false, error: '지금 이후의 일시를 골라주세요.' };
  if (t > Date.now() + SUSPEND_MAX_DAYS * DAY)
    return { ok: false, error: `최대 ${SUSPEND_MAX_DAYS}일까지 정할 수 있어요.` };
  return { ok: true, until: new Date(t).toISOString() };
}

/** "~ 26. 10. 08. 14:00까지 (6일 남음)" / "영구" */
export function suspendPeriodText(until: string | null) {
  if (!until) return '영구';
  const ms = Date.parse(until) - Date.now();
  const left =
    ms <= 0
      ? '곧 해제'
      : ms >= DAY
        ? `${Math.floor(ms / DAY)}일 남음`
        : `${Math.max(1, Math.ceil(ms / HOUR))}시간 남음`;
  return `~ ${dt(until)}까지 (${left})`;
}

const PERIOD_OPTIONS: { value: SuspendPeriod; label: string }[] = [
  { value: 'forever', label: '영구' },
  ...SUSPEND_PRESET_DAYS.map((d) => ({ value: `${d}` as const, label: `${d}일` })),
  { value: 'custom', label: '직접 선택' },
];

export function SuspendPeriodPicker({
  value,
  onChange,
}: {
  value: SuspendPeriodValue;
  onChange: (v: SuspendPeriodValue) => void;
}) {
  const resolved = resolveSuspendUntil(value);
  const today = toLocalInput(new Date().toISOString()).slice(0, 10);
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-label text-foreground">정지 기간</legend>
        <RadioGroup
          aria-label="정지 기간"
          value={value.period}
          onValueChange={(period) => onChange({ ...value, period })}
          options={PERIOD_OPTIONS}
          className="grid grid-cols-3 gap-2"
        />
      </fieldset>
      {value.period === 'custom' && (
        <Field
          label="종료 일시"
          required
          error={!resolved.ok && value.custom ? resolved.error : undefined}
          hint="이 시각이 지나면 자동으로 풀려요."
        >
          {(p) => (
            <DateTimeInput
              {...p}
              min={today}
              value={value.custom}
              onChange={(custom) => onChange({ ...value, custom })}
            />
          )}
        </Field>
      )}
    </div>
  );
}

// ───── 계정 생성 ─────

interface CreateState {
  email: string;
  nickname: string;
  role: Role;
  mode: 'auto' | 'manual';
  password: string;
  reason: string;
}

function TemporaryPasswordDialog({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const copy = () =>
    navigator.clipboard.writeText(password).then(
      () => toast.success('임시 비밀번호를 복사했어요'),
      () => toast.error('복사하지 못했어요. 직접 선택해 복사해주세요.'),
    );
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="임시 비밀번호"
      description={`${email} 계정을 만들었어요.`}
      footer={<Button onClick={onClose}>확인</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-sm border border-border bg-background-soft px-3 py-2.5 font-mono text-body break-all select-all">
            {password}
          </code>
          <Button variant="outline" onClick={() => void copy()}>
            <Copy className="size-4" aria-hidden />
            복사
          </Button>
        </div>
        <Alert tone="warning" title="이 창을 닫으면 다시 볼 수 없어요">
          회원에게 안전한 방법으로 전달하고, 첫 로그인 뒤 비밀번호를 바꾸도록 안내해주세요.
        </Alert>
      </div>
    </Dialog>
  );
}

function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (email: string, pw: string) => void;
}) {
  const viewerRole = useAuthStore((s) => s.user?.role);
  const roles: Role[] = viewerRole === 'SUPER_ADMIN' ? ['USER', 'ADMIN', 'SUPER_ADMIN'] : ['USER'];
  const [s, setS] = useState<CreateState>({
    email: '',
    nickname: '',
    role: 'USER',
    mode: 'auto',
    password: '',
    reason: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (p: Partial<CreateState>) => setS((v) => ({ ...v, ...p }));
  const create = useUserFormMutation((b: AdminCreateUserInput) => api.admin.createUser(b), setErrors);

  const submit = () => {
    const r = adminCreateUserSchema.safeParse({
      email: s.email,
      nickname: s.nickname,
      role: s.role,
      password: s.mode === 'manual' ? s.password : undefined,
      reason: s.reason.trim() || undefined,
    });
    if (!r.success) return setErrors(issuesToErrors(r.error.issues));
    setErrors({});
    create.mutate(r.data, {
      onSuccess: (res) => {
        toast.success('계정을 만들었어요');
        if (res.temporaryPassword) onCreated(res.user.email, res.temporaryPassword);
        else onClose();
      },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="계정 생성"
      description="인증 메일 없이 이메일 인증 완료로 만들어요. 첫 로그인 때 약관 동의 화면이 나와요."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={create.isPending} onClick={submit}>
            만들기
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="이메일" required error={errors.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="off"
              maxLength={254}
              value={s.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          )}
        </Field>
        <Field label="닉네임" required error={errors.nickname} hint="한글·영문·숫자·_ . 2~20자">
          {(p) => (
            <Input
              {...p}
              autoComplete="off"
              maxLength={20}
              value={s.nickname}
              onChange={(e) => set({ nickname: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="역할"
          error={errors.role}
          hint={
            viewerRole === 'SUPER_ADMIN'
              ? '판매자는 회원이 직접 판매자 등록(정산 계좌)을 해야 해요.'
              : '관리자 계정은 최고 관리자만 만들 수 있어요.'
          }
        >
          {(p) => (
            <Select
              {...p}
              value={s.role}
              onValueChange={(role) => set({ role })}
              options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label text-foreground">비밀번호</legend>
          <RadioGroup
            aria-label="비밀번호"
            value={s.mode}
            onValueChange={(mode) => set({ mode })}
            options={[
              {
                value: 'auto',
                label: '임시 비밀번호 자동 생성',
                description: '만든 직후 한 번만 보여드려요.',
              },
              { value: 'manual', label: '직접 입력' },
            ]}
          />
        </fieldset>
        {s.mode === 'manual' && (
          <Field label="비밀번호" required error={errors.password} hint="영문·숫자 포함 8~72자">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                maxLength={72}
                value={s.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            )}
          </Field>
        )}
        <Field label="사유 (선택)" error={errors.reason} hint="감사 로그에 남아요.">
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={500}
              className="min-h-0"
              value={s.reason}
              onChange={(e) => set({ reason: e.target.value })}
            />
          )}
        </Field>
        {/* Enter 로 제출 */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** 회원 목록 상단의 "계정 생성" 버튼 + 생성 폼 + 임시 비밀번호 안내 */
export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        계정 생성
      </Button>
      {open && (
        <CreateUserDialog
          onClose={() => setOpen(false)}
          onCreated={(email, password) => {
            setOpen(false);
            setIssued({ email, password });
          }}
        />
      )}
      {issued && (
        <TemporaryPasswordDialog
          email={issued.email}
          password={issued.password}
          onClose={() => setIssued(null)}
        />
      )}
    </>
  );
}

// ───── 정보 수정 ─────

interface EditState {
  nickname: string;
  email: string;
  emailVerified: boolean;
  bio: string;
  region: string;
  businessName: string;
  reason: string;
}

/** 바뀐 항목만 담는다 (서버는 strict — 모르는 키·빈 변경은 거절) */
function diffUser(u: AdminUserDetail, s: EditState): AdminUpdateUserInput {
  const b: AdminUpdateUserInput = {};
  const nickname = s.nickname.trim();
  if (nickname !== u.nickname) b.nickname = nickname;
  const email = s.email.trim();
  const emailChanged = email.toLowerCase() !== u.email.toLowerCase();
  if (emailChanged) b.email = email;
  // 이메일만 바꾸면 서버는 인증 상태를 그대로 두므로, 이메일을 바꿀 때는 인증 여부를 항상 함께 보낸다
  if (emailChanged || s.emailVerified !== Boolean(u.emailVerifiedAt)) b.emailVerified = s.emailVerified;
  const bio = s.bio.trim();
  if (bio !== u.profile.bio) b.bio = bio;
  const region = s.region.trim() || null;
  if (region !== (u.profile.region ?? null)) b.region = region;
  if (u.seller) {
    const businessName = s.businessName.trim() || null;
    if (businessName !== (u.seller.businessName ?? null)) b.businessName = businessName;
  }
  const reason = s.reason.trim();
  if (reason) b.reason = reason;
  return b;
}

export function EditUserDialog({ user: u, onClose }: { user: AdminUserDetail; onClose: () => void }) {
  const verifiedBefore = Boolean(u.emailVerifiedAt);
  const [s, setS] = useState<EditState>({
    nickname: u.nickname,
    email: u.email,
    emailVerified: verifiedBefore,
    bio: u.profile.bio,
    region: u.profile.region ?? '',
    businessName: u.seller?.businessName ?? '',
    reason: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (p: Partial<EditState>) => setS((v) => ({ ...v, ...p }));
  const save = useUserFormMutation((b: AdminUpdateUserInput) => api.admin.updateUser(u.id, b), setErrors);
  const body = diffUser(u, s);
  const changed = Object.keys(body).some((k) => k !== 'reason');
  const emailChanged = s.email.trim().toLowerCase() !== u.email.toLowerCase();

  const submit = () => {
    const r = adminUpdateUserSchema.safeParse(body);
    if (!r.success) return setErrors(issuesToErrors(r.error.issues));
    setErrors({});
    save.mutate(r.data, {
      onSuccess: () => {
        toast.success('회원 정보를 수정했어요');
        onClose();
      },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="정보 수정"
      description="바꾼 항목만 저장되고 감사 로그에 남아요."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button disabled={!changed} loading={save.isPending} onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {errors._ && <Alert tone="destructive">{errors._}</Alert>}
        <Field label="닉네임" required error={errors.nickname}>
          {(p) => (
            <Input
              {...p}
              maxLength={20}
              value={s.nickname}
              onChange={(e) => set({ nickname: e.target.value })}
            />
          )}
        </Field>
        <Field label="이메일" required error={errors.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="off"
              maxLength={254}
              value={s.email}
              onChange={(e) => {
                const email = e.target.value;
                const same = email.trim().toLowerCase() === u.email.toLowerCase();
                // 이메일을 바꾸면 인증 완료를 기본으로 끈다 (원래대로 되돌리면 기존 상태)
                set({ email, emailVerified: same ? verifiedBefore : false });
              }}
            />
          )}
        </Field>
        <Switch
          checked={s.emailVerified}
          onCheckedChange={(emailVerified) => set({ emailVerified })}
          label="이메일 인증 완료"
          description={
            emailChanged
              ? '새 이메일은 기본으로 인증 전이에요. 확인했다면 켜주세요.'
              : u.emailVerifiedAt
                ? `${dt(u.emailVerifiedAt)} 인증 · 끄면 인증 전으로 돌아가요.`
                : '켜면 인증 메일 없이 인증 완료로 기록해요.'
          }
        />
        <Field label="소개" error={errors.bio} hint={`${s.bio.length} / 300`}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={300}
              className="min-h-0"
              value={s.bio}
              onChange={(e) => set({ bio: e.target.value })}
            />
          )}
        </Field>
        <Field label="지역" error={errors.region}>
          {(p) => (
            <Input {...p} maxLength={50} value={s.region} onChange={(e) => set({ region: e.target.value })} />
          )}
        </Field>
        {u.seller && (
          <Field label="상호" error={errors.businessName}>
            {(p) => (
              <Input
                {...p}
                maxLength={60}
                value={s.businessName}
                onChange={(e) => set({ businessName: e.target.value })}
              />
            )}
          </Field>
        )}
        <Field label="사유 (선택)" error={errors.reason} hint="감사 로그에 남아요.">
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={500}
              className="min-h-0"
              value={s.reason}
              onChange={(e) => set({ reason: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
