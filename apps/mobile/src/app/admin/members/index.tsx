import { ROLES, USER_STATUSES, type AdminUserRow } from '@shop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { AdminList } from '@/components/admin/admin-list';
import { AdminRow } from '@/components/admin/row';
import { StatusText } from '@/components/admin/status';
import { Segmented } from '@/components/ui/segmented';
import { api } from '@/lib/api';
import { dt, ROLE_LABEL, USER_STATUS_LABEL } from '@/lib/admin';

type Tab = 'users' | 'sellers';

const TABS: { value: Tab; label: string }[] = [
  { value: 'users', label: '회원' },
  { value: 'sellers', label: '판매자 인증' },
];

const ROLE_FILTER = {
  key: 'role',
  label: '역할',
  options: ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
};

/** 가장 눈여겨볼 상태 하나만: 정지·탈퇴 > 판매자 인증 대기 > 인증 판매자 */
function statusOf(u: AdminUserRow) {
  if (u.status !== 'ACTIVE') return <StatusText label={USER_STATUS_LABEL[u.status]} tone="negative" />;
  if (u.isSeller && !u.sellerVerifiedAt) return <StatusText label="인증 대기" tone="warning" />;
  if (u.isSeller) return <StatusText label="인증 판매자" tone="positive" />;
  return null;
}

/** 회원 한 줄: 닉네임 · 역할과 이메일 · 대표 상태 · 가입·최근 로그인 */
function UserRow({ u }: { u: AdminUserRow }) {
  return (
    <AdminRow
      title={u.nickname}
      detail={`${ROLE_LABEL[u.role]} · ${u.email}`}
      status={statusOf(u)}
      meta={`가입 ${dt(u.createdAt)}${u.lastLoginAt ? ` · 최근 로그인 ${dt(u.lastLoginAt)}` : ''}`}
      accessibilityLabel={`${u.nickname}, ${ROLE_LABEL[u.role]}, ${u.email}, ${USER_STATUS_LABEL[u.status]}${u.identityVerified ? ', 본인인증' : ''}`}
      accessibilityHint="회원 상세를 열어요"
      onPress={() => router.push({ pathname: '/admin/members/[id]', params: { id: u.id } })}
    />
  );
}

const renderUser = (u: AdminUserRow) => <UserRow u={u} />;

/** 회원 / 판매자 인증 목록. 다른 탭에서 { tab, status } 로 바로 열 수 있다 */
export default function AdminMembersScreen() {
  const params = useLocalSearchParams<{ tab?: string; status?: string }>();
  const tab: Tab = params.tab === 'sellers' ? 'sellers' : 'users';
  const status = USER_STATUSES.find((s) => s === params.status);

  const segment = (
    <Segmented
      label="보기"
      options={TABS}
      value={tab}
      onChange={(v) => router.setParams({ tab: v, status: undefined })}
    />
  );

  if (tab === 'sellers')
    return (
      <AdminList
        key="sellers"
        queryKey="sellers"
        fetcher={api.admin.sellers}
        header={segment}
        searchPlaceholder="이메일 · 닉네임 · ID"
        filters={[
          {
            key: 'verified',
            label: '인증',
            options: [
              { value: 'pending', label: '인증 대기' },
              { value: 'verified', label: '인증 완료' },
            ],
            initial: 'pending',
          },
        ]}
        renderItem={renderUser}
        emptyTitle="해당하는 판매자가 없어요."
      />
    );

  return (
    <AdminList
      key={`users:${status ?? 'all'}`}
      queryKey="users"
      fetcher={api.admin.users}
      header={segment}
      searchPlaceholder="이메일 · 닉네임 · ID"
      filters={[
        ROLE_FILTER,
        {
          key: 'status',
          label: '상태',
          options: USER_STATUSES.map((s) => ({ value: s, label: USER_STATUS_LABEL[s] })),
          initial: status,
        },
      ]}
      renderItem={renderUser}
      emptyTitle="해당하는 회원이 없어요."
    />
  );
}
