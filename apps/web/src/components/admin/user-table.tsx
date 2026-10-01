'use client';

import { ROLES, type AdminUserRow, type Role } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Sheet } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { AdminList, dt, useAdminAction, useAdminList } from './admin-list';
import { PromptDialog } from './prompt-dialog';
import {
  EditUserDialog,
  ROLE_LABEL,
  SuspendPeriodPicker,
  initialSuspendPeriod,
  resolveSuspendUntil,
  suspendPeriodText,
  type SuspendPeriodValue,
} from './user-forms';

const STATUS_LABEL = { ACTIVE: '정상', SUSPENDED: '정지', DELETED: '탈퇴' } as const;
const ADMIN_ROLES: readonly Role[] = ['ADMIN', 'SUPER_ADMIN'];
type Prompt = 'suspend' | 'restore' | 'strikes' | 'delete' | 'edit' | null;

function UserSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const me = useAuthStore((s) => s.user)!;
  const { data: u } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.admin.user(id) });
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [period, setPeriod] = useState<SuspendPeriodValue>({ period: 'forever', custom: '' });
  const inv = ['users', 'user', 'sellers'];
  const suspended = u?.status === 'SUSPENDED';
  const suspend = useAdminAction(
    (v: { reason: string; until: string | null }) => api.admin.suspend(id, v.reason, v.until),
    suspended ? '정지 기간을 바꿨어요' : '이용을 정지했어요',
    inv,
  );
  const restore = useAdminAction((r: string) => api.admin.restore(id, r), '정지를 해제했어요', inv);
  const strikes = useAdminAction(
    (r: string) => api.admin.resetStrikes(id, r),
    '미결제 기록을 초기화했어요',
    inv,
  );
  const remove = useAdminAction((r: string) => api.admin.deleteUser(id, r), '회원을 삭제했어요', inv);
  const role = useAdminAction((r: Role) => api.admin.setRole(id, r), '역할을 바꿨어요', inv);
  const verify = useAdminAction((v: boolean) => api.admin.verifySeller(id, v), '판매자 인증을 바꿨어요', inv);
  const self = me.id === id;
  const isSuper = me.role === 'SUPER_ADMIN';
  // 최고 관리자는 모든 역할, 관리자는 관리자 역할을 부여할 수 없다
  const roles = isSuper ? [...ROLES] : ROLES.filter((r) => !ADMIN_ROLES.includes(r));
  // 관리자 계정은 최고 관리자만 다룰 수 있다 (서버도 같은 규칙으로 거절)
  const adminTarget = u ? ADMIN_ROLES.includes(u.role) : false;
  const canManage = !!u && !self && u.status !== 'DELETED' && (isSuper || !adminTarget);
  const close = () => setPrompt(null);
  const openSuspend = () => {
    if (u) setPeriod(initialSuspendPeriod(u));
    setPrompt('suspend');
  };
  const resolved = resolveSuspendUntil(period);

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()} title={u?.nickname ?? '회원'} description={u?.email}>
      {u && (
        <div className="flex flex-col gap-5 text-small">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={u.status === 'ACTIVE' ? 'primary' : 'destructive'}>{STATUS_LABEL[u.status]}</Badge>
            <Badge tone="outline">{ROLE_LABEL[u.role]}</Badge>
            <Badge tone={u.emailVerifiedAt ? 'neutral' : 'outline'}>
              {u.emailVerifiedAt ? '이메일 인증' : '이메일 미인증'}
            </Badge>
            {u.consentRequired && <Badge tone="outline">약관 동의 대기</Badge>}
            {u.identityVerified && <Badge tone="neutral">본인인증</Badge>}
            {u.socialProviders.map((p) => (
              <Badge key={p} tone="outline">
                {p}
              </Badge>
            ))}
          </div>
          {suspended && (
            <div className="flex flex-col gap-0.5 text-destructive">
              <p>정지 기간: {suspendPeriodText(u.suspendedUntil)}</p>
              {u.statusReason && <p>정지 사유: {u.statusReason}</p>}
            </div>
          )}
          {!suspended && u.statusReason && <p className="text-destructive">사유: {u.statusReason}</p>}
          <dl className="grid grid-cols-[96px_1fr] gap-y-1.5">
            <dt className="text-muted">가입</dt>
            <dd>{dt(u.createdAt)}</dd>
            <dt className="text-muted">최근 로그인</dt>
            <dd>{dt(u.lastLoginAt)}</dd>
            <dt className="text-muted">이메일 인증</dt>
            <dd>{u.emailVerifiedAt ? dt(u.emailVerifiedAt) : '인증 전'}</dd>
            <dt className="text-muted">평점 · 거래</dt>
            <dd>
              {u.profile.ratingAvg.toFixed(1)} ({u.profile.ratingCount}) · {u.profile.tradeCount}회
            </dd>
            <dt className="text-muted">작품 · 입찰</dt>
            <dd>
              {u.counts.products}점 · {u.counts.bids}회
            </dd>
            <dt className="text-muted">주문</dt>
            <dd>
              구매 {u.counts.ordersBought} · 판매 {u.counts.ordersSold}
            </dd>
            <dt className="text-muted">받은 신고</dt>
            <dd className={u.counts.reportsAgainst ? 'text-destructive' : undefined}>
              {u.counts.reportsAgainst}건
            </dd>
            <dt className="text-muted">낙찰 미결제</dt>
            <dd>{u.unpaidStrikes}회</dd>
            {u.seller && (
              <>
                <dt className="text-muted">정산 계좌</dt>
                <dd>
                  {u.seller.bankName} {u.seller.bankAccountMasked} ({u.seller.accountHolder})
                </dd>
              </>
            )}
          </dl>
          <Link href={`/users/${u.id}`} target="_blank" className="text-primary underline">
            공개 프로필 보기
          </Link>
          {!self && u.status !== 'DELETED' && !canManage && (
            <p className="border-t border-border pt-4 text-muted">
              관리자 계정은 최고 관리자만 변경할 수 있어요.
            </p>
          )}
          {canManage && (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <span className="w-16 text-muted">역할</span>
                <Select
                  aria-label="역할"
                  value={u.role}
                  onValueChange={(r) => confirm(`역할을 ${ROLE_LABEL[r]}(으)로 바꿀까요?`) && role.mutate(r)}
                  options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  className="flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setPrompt('edit')}>
                  정보 수정
                </Button>
                {suspended ? (
                  <>
                    <Button size="sm" onClick={() => setPrompt('restore')}>
                      정지 해제
                    </Button>
                    <Button variant="outline" size="sm" onClick={openSuspend}>
                      기간 변경
                    </Button>
                  </>
                ) : (
                  <Button variant="destructive" size="sm" onClick={openSuspend}>
                    이용 정지
                  </Button>
                )}
                {u.unpaidStrikes > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setPrompt('strikes')}>
                    미결제 초기화
                  </Button>
                )}
                {u.isSeller && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={verify.isPending}
                    onClick={() => verify.mutate(!u.sellerVerifiedAt)}
                  >
                    {u.sellerVerifiedAt ? '판매자 인증 해제' : '판매자 인증'}
                  </Button>
                )}
              </div>
              <div className="border-t border-border pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setPrompt('delete')}
                >
                  회원 삭제
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {prompt === 'edit' && u && <EditUserDialog user={u} onClose={close} />}
      <PromptDialog
        open={prompt === 'suspend'}
        onOpenChange={(v) => !v && close()}
        title={suspended ? '정지 기간 변경' : '이용 정지'}
        description={
          suspended
            ? '새 기간과 사유로 바꿔요. 일 단위 기간은 지금부터 다시 계산돼요.'
            : '모든 기기에서 로그아웃되고, 로그인할 때 사유와 기간이 안내돼요.'
        }
        confirmLabel={suspended ? '변경' : '정지'}
        destructive
        pending={suspend.isPending}
        confirmDisabled={!resolved.ok}
        onSubmit={(reason) => {
          // 프리셋 기간은 누른 시점부터 계산한다
          const r = resolveSuspendUntil(period);
          if (r.ok) suspend.mutate({ reason, until: r.until }, { onSuccess: close });
        }}
      >
        <SuspendPeriodPicker value={period} onChange={setPeriod} />
      </PromptDialog>
      <PromptDialog
        open={prompt === 'restore'}
        onOpenChange={(v) => !v && close()}
        title="정지 해제"
        confirmLabel="해제"
        pending={restore.isPending}
        onSubmit={(r) => restore.mutate(r, { onSuccess: close })}
      />
      <PromptDialog
        open={prompt === 'strikes'}
        onOpenChange={(v) => !v && close()}
        title="미결제 기록 초기화"
        description="경매 참여 제한이 풀려요."
        confirmLabel="초기화"
        pending={strikes.isPending}
        onSubmit={(r) => strikes.mutate(r, { onSuccess: close })}
      />
      <PromptDialog
        open={prompt === 'delete'}
        onOpenChange={(v) => !v && close()}
        title="회원 삭제"
        description="회원 탈퇴와 같이 개인정보가 익명화되고 되돌릴 수 없어요. 진행 중인 거래가 있으면 삭제할 수 없어요."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onSubmit={(r) =>
          remove.mutate(r, {
            onSuccess: () => {
              close();
              onClose();
            },
          })
        }
      />
    </Sheet>
  );
}

/** 회원 목록 / 판매자 인증 목록 공용 */
export function UserTable({ mode }: { mode: 'users' | 'sellers' }) {
  const sp = useSearchParams();
  const list = useAdminList<AdminUserRow>(
    mode,
    mode === 'users' ? api.admin.users : api.admin.sellers,
    mode === 'sellers'
      ? { verified: sp.get('verified') ?? 'pending' }
      : { status: sp.get('status') ?? undefined },
  );
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <AdminList
        list={list}
        rowKey={(u) => u.id}
        searchPlaceholder="이메일 · 닉네임 · ID"
        filters={
          mode === 'users'
            ? [
                {
                  key: 'role',
                  label: '역할',
                  options: ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
                },
                {
                  key: 'status',
                  label: '상태',
                  options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
                },
              ]
            : [
                {
                  key: 'verified',
                  label: '인증',
                  options: [
                    { value: 'pending', label: '인증 대기' },
                    { value: 'verified', label: '인증 완료' },
                  ],
                },
              ]
        }
        columns={[
          {
            key: 'name',
            header: '회원',
            cell: (u) => (
              <button type="button" onClick={() => setOpen(u.id)} className="text-left hover:underline">
                <span className="block font-semibold">{u.nickname}</span>
                <span className="text-caption text-muted">{u.email}</span>
              </button>
            ),
          },
          { key: 'role', header: '역할', cell: (u) => ROLE_LABEL[u.role] },
          {
            key: 'status',
            header: '상태',
            cell: (u) => (
              <Badge tone={u.status === 'ACTIVE' ? 'neutral' : 'destructive'}>{STATUS_LABEL[u.status]}</Badge>
            ),
          },
          { key: 'identity', header: '본인인증', cell: (u) => (u.identityVerified ? '완료' : '-') },
          {
            key: 'seller',
            header: '판매자',
            cell: (u) => (u.isSeller ? (u.sellerVerifiedAt ? '인증' : '대기') : '-'),
          },
          { key: 'created', header: '가입', cell: (u) => dt(u.createdAt) },
          { key: 'login', header: '최근 로그인', cell: (u) => dt(u.lastLoginAt) },
        ]}
      />
      {open && <UserSheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
