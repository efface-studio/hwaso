import {
  ADMIN_ROLES,
  AUTH_PROVIDER_LABEL,
  ROLES,
  type AdminUserDetail,
  type MeDto,
  type Role,
} from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useAdminAction } from '@/components/admin/admin-list';
import { EditMemberSheet } from '@/components/admin/member-forms';
import { promptReason, promptSuspension } from '@/components/admin/prompt';
import { AdminRow, RowSection } from '@/components/admin/row';
import { StatusText } from '@/components/admin/status';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { actionSheet } from '@/lib/action-sheet';
import { dt, ROLE_LABEL, suspensionText, USER_STATUS_LABEL } from '@/lib/admin';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme, type Colors } from '@/theme';
import { readable } from '@/hooks/use-layout';

/** 조치 후 다시 불러올 목록·상세 */
const INVALIDATE = ['users', 'user', 'sellers'];

/**
 * 이 관리자가 회원을 다룰 수 있는지: 본인·탈퇴 회원은 안 되고, 관리자 계정은 최고 관리자만 (서버와 같은 규칙)
 */
const canManage = (me: MeDto | null, u: AdminUserDetail) =>
  !!me &&
  me.id !== u.id &&
  u.status !== 'DELETED' &&
  (!ADMIN_ROLES.includes(u.role) || me.role === 'SUPER_ADMIN');

/** 소셜 로그인 표기 (모르는 값이면 그대로) */
const providerLabel = (p: string) => Object.entries(AUTH_PROVIDER_LABEL).find(([k]) => k === p)?.[1] ?? p;

/** 항목 한 줄: 왼쪽 이름 · 오른쪽 값 (주의할 값은 빨간 글자) */
function InfoRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <AdminRow
      title={
        <Text variant="body" numberOfLines={1}>
          {label}
        </Text>
      }
      value={
        <Text variant="body" color={danger ? 'destructive' : 'muted'} style={styles.value} selectable>
          {value}
        </Text>
      }
      accessibilityLabel={`${label} ${value}`}
    />
  );
}

/** 관리 한 줄: 누르면 확인 창·선택 메뉴를 띄운다. 처리 중에는 오른쪽에 로딩 표시 */
function ActionRow({
  label,
  color = 'primary',
  value,
  pending,
  chevron = false,
  hint,
  onPress,
}: {
  label: string;
  color?: keyof Colors;
  value?: string;
  pending?: boolean;
  chevron?: boolean;
  hint?: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <AdminRow
      title={
        <Text variant="body" color={color} numberOfLines={1}>
          {label}
        </Text>
      }
      value={
        pending ? (
          <ActivityIndicator color={t.colors.muted} />
        ) : value ? (
          <Text variant="body" color="muted">
            {value}
          </Text>
        ) : undefined
      }
      chevron={chevron}
      disabled={pending}
      accessibilityLabel={value ? `${label}, 현재 ${value}` : label}
      accessibilityHint={hint}
      onPress={onPress}
    />
  );
}

/** 역할 변경 · 판매자 인증 · 미결제 초기화 · 정지(기간)/해제 · 삭제 (다룰 수 없는 회원이면 숨긴다) */
function Actions({ u }: { u: AdminUserDetail }) {
  const me = useAuthStore((s) => s.user);
  const id = u.id;
  const suspend = useAdminAction(
    (r: string, until: string | null) => api.admin.suspend(id, r, until),
    '이용을 정지했어요',
    INVALIDATE,
  );
  const remove = useAdminAction((r: string) => api.admin.deleteUser(id, r), null, INVALIDATE);
  const restore = useAdminAction((r: string) => api.admin.restore(id, r), '정지를 해제했어요', INVALIDATE);
  const strikes = useAdminAction(
    (r: string) => api.admin.resetStrikes(id, r),
    '미결제 기록을 초기화했어요',
    INVALIDATE,
  );
  const role = useAdminAction((r: Role) => api.admin.setRole(id, r), '역할을 바꿨어요', INVALIDATE);
  const verify = useAdminAction(
    (v: boolean) => api.admin.verifySeller(id, v),
    '판매자 인증을 바꿨어요',
    INVALIDATE,
  );
  // 관리자·최고 관리자 부여는 최고 관리자만 (관리자에게는 관리자 역할을 보이지 않는다)
  const roles = ROLES.filter((r) => me?.role === 'SUPER_ADMIN' || !ADMIN_ROLES.includes(r));

  const pickRole = () =>
    actionSheet(
      '역할 변경',
      roles.map((r) => ({
        label: r === u.role ? `${ROLE_LABEL[r]} (현재)` : ROLE_LABEL[r],
        onPress: () => {
          if (r === u.role) return;
          Alert.alert(`역할을 ${ROLE_LABEL[r]}(으)로 바꿀까요?`, undefined, [
            { text: '취소', style: 'cancel' },
            { text: '바꾸기', onPress: () => role.mutate([r]) },
          ]);
        },
      })),
    );

  const onSuspend = async () => {
    const changing = u.status === 'SUSPENDED';
    const r = await promptSuspension({
      title: changing ? '정지 기간 변경' : '이용 정지',
      description: changing
        ? `지금: ${suspensionText(u.suspendedUntil)}. 새 기간과 사유로 바꿔요.`
        : '모든 기기에서 로그아웃되고, 로그인할 때 기간과 사유가 안내돼요.',
      confirmLabel: changing ? '변경' : '정지',
      destructive: true,
    });
    if (r) suspend.mutate([r.reason, r.until]);
  };
  // 되돌릴 수 없으므로 시스템 확인 창을 먼저 띄우고, 사유를 받는다
  const onDelete = () =>
    Alert.alert(
      '회원을 삭제할까요?',
      '탈퇴와 같이 개인정보를 지우고 익명으로 바꿔요. 되돌릴 수 없어요. 진행 중인 거래가 있으면 삭제할 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            void promptReason({ title: '회원 삭제', confirmLabel: '삭제', destructive: true }).then(
              (reason) =>
                reason &&
                remove.mutate([reason], {
                  onSuccess: () => {
                    Alert.alert('회원을 삭제했어요');
                    router.back();
                  },
                }),
            ),
        },
      ],
    );
  const onRestore = async () => {
    const reason = await promptReason({ title: '정지 해제', confirmLabel: '해제' });
    if (reason) restore.mutate([reason]);
  };
  const onStrikes = async () => {
    const reason = await promptReason({
      title: '미결제 기록 초기화',
      description: '경매 참여 제한이 풀려요.',
      confirmLabel: '초기화',
    });
    if (reason) strikes.mutate([reason]);
  };
  const onVerify = () => {
    const next = !u.sellerVerifiedAt;
    Alert.alert(
      next ? '인증 판매자로 표시할까요?' : '판매자 인증을 해제할까요?',
      next ? undefined : '인증 판매자 표시가 사라져요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: next ? '인증' : '해제',
          style: next ? 'default' : 'destructive',
          onPress: () => verify.mutate([next]),
        },
      ],
    );
  };

  return (
    <RowSection title="관리">
      <ActionRow
        label="역할 변경"
        color="foreground"
        value={ROLE_LABEL[u.role]}
        chevron
        pending={role.isPending}
        hint="바꿀 역할을 골라요"
        onPress={pickRole}
      />
      {u.isSeller && (
        <ActionRow
          label={u.sellerVerifiedAt ? '판매자 인증 해제' : '판매자 인증'}
          color={u.sellerVerifiedAt ? 'destructive' : 'primary'}
          pending={verify.isPending}
          onPress={onVerify}
        />
      )}
      {u.unpaidStrikes > 0 && (
        <ActionRow label="미결제 기록 초기화" pending={strikes.isPending} onPress={() => void onStrikes()} />
      )}
      {u.status === 'ACTIVE' ? (
        <ActionRow
          label="이용 정지"
          color="destructive"
          pending={suspend.isPending}
          hint="기간과 사유를 정하고 정지해요"
          onPress={() => void onSuspend()}
        />
      ) : (
        <>
          <ActionRow
            label="정지 해제"
            pending={restore.isPending}
            hint="사유를 입력하고 해제해요"
            onPress={() => void onRestore()}
          />
          <ActionRow
            label="정지 기간 변경"
            color="foreground"
            value={u.suspendedUntil ? '기간' : '영구'}
            pending={suspend.isPending}
            hint="새 기간과 사유를 정해요"
            onPress={() => void onSuspend()}
          />
        </>
      )}
      <ActionRow
        label="회원 삭제"
        color="destructive"
        pending={remove.isPending}
        hint="확인 후 사유를 입력하고 삭제해요"
        onPress={onDelete}
      />
    </RowSection>
  );
}

/** 이름 아래 한 줄: 눈여겨볼 상태 하나(정지·탈퇴 > 인증 대기) + 역할·본인인증 */
function StatusLine({ u }: { u: AdminUserDetail }) {
  const status =
    u.status !== 'ACTIVE' ? (
      <StatusText label={USER_STATUS_LABEL[u.status]} tone="negative" />
    ) : u.isSeller && !u.sellerVerifiedAt ? (
      <StatusText label="판매자 인증 대기" tone="warning" />
    ) : null;
  const facts = [ROLE_LABEL[u.role], u.identityVerified ? '본인인증' : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.statusLine}>
      {status}
      {status && (
        <Text variant="small" color="faint">
          ·
        </Text>
      )}
      <Text variant="small" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {facts}
      </Text>
    </View>
  );
}

function Detail({ u }: { u: AdminUserDetail }) {
  const me = useAuthStore((s) => s.user);
  return (
    <>
      <View style={styles.identity}>
        <Text variant="h2" numberOfLines={1}>
          {u.nickname}
        </Text>
        <Text variant="small" color="muted" numberOfLines={1} selectable>
          {u.email}
        </Text>
        <StatusLine u={u} />
      </View>

      <RowSection title="계정">
        {u.statusReason && (
          <AdminRow
            title={
              <Text variant="body" numberOfLines={1}>
                정지 사유
              </Text>
            }
            detail={
              <Text variant="small" color="destructive" selectable>
                {u.statusReason}
              </Text>
            }
            accessibilityLabel={`정지 사유 ${u.statusReason}`}
          />
        )}
        {u.status === 'SUSPENDED' && (
          <InfoRow label="정지 기간" value={suspensionText(u.suspendedUntil)} danger />
        )}
        <InfoRow label="가입" value={dt(u.createdAt)} />
        <InfoRow label="최근 로그인" value={dt(u.lastLoginAt)} />
        <InfoRow label="이메일 인증" value={u.emailVerifiedAt ? dt(u.emailVerifiedAt) : '안 함'} />
        {u.consentRequired && <InfoRow label="약관 동의" value="첫 로그인 때 받아요" />}
        <InfoRow label="비밀번호 로그인" value={u.hasPassword ? '가능' : '간편 로그인만'} />
        <InfoRow label="본인인증" value={u.identityVerified ? '완료' : '안 함'} />
        <InfoRow
          label="간편 로그인"
          value={u.socialProviders.length ? u.socialProviders.map(providerLabel).join(', ') : '없음'}
        />
      </RowSection>

      <RowSection title="활동">
        <InfoRow label="평점" value={`${u.profile.ratingAvg.toFixed(1)} (${u.profile.ratingCount})`} />
        <InfoRow label="거래" value={`${u.profile.tradeCount}회`} />
        <InfoRow label="작품 · 입찰" value={`${u.counts.products}점 · ${u.counts.bids}회`} />
        <InfoRow label="주문" value={`구매 ${u.counts.ordersBought} · 판매 ${u.counts.ordersSold}`} />
        <InfoRow
          label="받은 신고"
          value={`${u.counts.reportsAgainst}건`}
          danger={u.counts.reportsAgainst > 0}
        />
        <InfoRow label="낙찰 미결제" value={`${u.unpaidStrikes}회`} danger={u.unpaidStrikes > 0} />
      </RowSection>

      {u.seller && (
        <RowSection title="판매자">
          {u.seller.businessName && <InfoRow label="상호" value={u.seller.businessName} />}
          <InfoRow label="인증" value={u.sellerVerifiedAt ? dt(u.sellerVerifiedAt) : '대기'} />
          <AdminRow
            title={
              <Text variant="body" numberOfLines={1}>
                정산 계좌
              </Text>
            }
            detail={`${u.seller.bankName} ${u.seller.bankAccountMasked} · 예금주 ${u.seller.accountHolder}`}
            accessibilityLabel={`정산 계좌 ${u.seller.bankName} ${u.seller.bankAccountMasked}, 예금주 ${u.seller.accountHolder}`}
          />
        </RowSection>
      )}

      <RowSection>
        <AdminRow
          title={
            <Text variant="body" numberOfLines={1}>
              공개 프로필 보기
            </Text>
          }
          accessibilityRole="link"
          accessibilityLabel="공개 프로필 보기"
          onPress={() => router.push({ pathname: '/users/[id]', params: { id: u.id } })}
        />
      </RowSection>

      {canManage(me, u) && <Actions u={u} />}
    </>
  );
}

export default function AdminMemberScreen() {
  const t = useTheme();
  const me = useAuthStore((s) => s.user);
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.admin.user(id) });
  const pull = usePullRefresh(q.refetch);
  const [editing, setEditing] = useState(false);
  const u = q.data;
  const editable = !!u && canManage(me, u);

  return (
    <>
      <Stack.Screen
        options={{
          title: u?.nickname ?? '회원 상세',
          unstable_headerRightItems: () =>
            editable
              ? [
                  {
                    type: 'button',
                    label: '수정',
                    icon: { type: 'sfSymbol', name: 'square.and.pencil' },
                    onPress: () => setEditing(true),
                  },
                ]
              : [],
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={styles.body}
        refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
      >
        {u ? (
          <Detail u={u} />
        ) : q.isError ? (
          <Empty
            kind="error"
            title="불러오지 못했어요"
            action={{ title: '다시 시도', onPress: () => void q.refetch() }}
          />
        ) : (
          <View style={styles.pad}>
            <Loading variant="text" />
          </View>
        )}
      </ScrollView>
      {editing && u && <EditMemberSheet key={u.id} u={u} onClose={() => setEditing(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  body: { ...readable, paddingTop: 8, paddingBottom: 48 },
  pad: { paddingHorizontal: 16 },
  identity: { paddingHorizontal: 16, paddingTop: 4, gap: 2 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  value: { fontVariant: ['tabular-nums'], textAlign: 'right' },
});
