import { AUCTION_STATUS_LABEL, formatPrice, type AdminAuctionRow, type AuctionStatus } from '@shop/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdminList, useAdminAction } from '@/components/admin/admin-list';
import { promptReason } from '@/components/admin/prompt';
import { AdminRow, RowSeparator } from '@/components/admin/row';
import { StatusText } from '@/components/admin/status';
import { Text } from '@/components/ui/text';
import { type SheetOption, actionSheet } from '@/lib/action-sheet';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';

const STATUS_OPTIONS = Object.entries(AUCTION_STATUS_LABEL).map(([value, label]) => ({ value, label }));
/** 강제 취소할 수 있는 상태 (거래 완료·취소된 경매는 제외) */
const CANCELLABLE: AuctionStatus[] = ['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED'];

const initialOf = (options: { value: string }[], v: string | undefined) =>
  options.some((o) => o.value === v) ? v : undefined;

/** 경매 상태 하나만: 낙찰 미결제 > 진행 중 > 그 밖의 상태(흐린 글자) */
function statusOf(a: AdminAuctionRow) {
  if (a.result === 'UNPAID') return <StatusText label="미결제" tone="negative" />;
  return (
    <StatusText label={AUCTION_STATUS_LABEL[a.status]} tone={a.status === 'LIVE' ? 'positive' : 'neutral'} />
  );
}

/** 경매 한 줄: 작품명과 현재가 · 판매자와 입찰 수 · 상태 · 기간 */
function AuctionRow({ a, onPress }: { a: AdminAuctionRow; onPress: () => void }) {
  const status = `${AUCTION_STATUS_LABEL[a.status]}${a.result === 'UNPAID' ? ' · 미결제' : ''}`;
  return (
    <AdminRow
      title={a.title}
      value={formatPrice(a.currentPrice)}
      detail={`${a.seller.nickname} · 입찰 ${a.bidCount}회`}
      status={statusOf(a)}
      meta={`${dt(a.startsAt)} ~ ${dt(a.endsAt)}`}
      accessibilityLabel={`${a.title}, ${a.seller.nickname}, 현재가 ${formatPrice(a.currentPrice)}, 입찰 ${a.bidCount}회, ${status}`}
      accessibilityHint="눌러서 관리 메뉴 열기"
      onPress={onPress}
    />
  );
}

/** 경매 정책 화면으로 가는 줄 (보기 전환 아래, 목록과는 구분선으로 나눈다) */
function PolicyLink() {
  return (
    <View style={styles.policy}>
      <RowSeparator inset={0} />
      <AdminRow
        title={
          <Text variant="body" numberOfLines={1}>
            경매 정책
          </Text>
        }
        detail="연장 규칙 · 낙찰 결제 기한 · 종료 임박 알림"
        accessibilityRole="link"
        accessibilityLabel="경매 정책"
        accessibilityHint="연장·결제 기한 등 경매 정책 설정 열기"
        onPress={() => router.push('/admin/ops/policy')}
      />
      <RowSeparator inset={0} />
    </View>
  );
}

/** 경매: 진행·예정 경매를 확인하고, 정당한 사유가 확인된 경매를 강제 취소한다 */
export function AuctionList({ header, status }: { header: ReactNode; status?: string }) {
  const cancel = useAdminAction(api.admin.cancelAuction, '경매를 취소했어요', ['auctions', 'dashboard']);

  const manage = (a: AdminAuctionRow) => {
    const options: SheetOption[] = [
      {
        label: '경매 보기',
        onPress: () => router.push({ pathname: '/auctions/[id]', params: { id: a.id } }),
      },
    ];
    if (CANCELLABLE.includes(a.status))
      options.push({
        label: '강제 취소',
        destructive: true,
        onPress: async () => {
          const r = await promptReason({
            title: '경매 강제 취소',
            description: `${a.title} — 입찰자와 판매자에게 영향이 있어요. 위작·파손 등 정당한 사유가 확인된 경우에만 사용하세요.`,
            confirmLabel: '강제 취소',
            destructive: true,
          });
          if (r !== null) cancel.mutate([a.id, r]);
        },
      });
    actionSheet('관리', options);
  };

  return (
    <AdminList
      queryKey="auctions"
      fetcher={api.admin.auctions}
      header={
        <>
          {header}
          <PolicyLink />
        </>
      }
      searchPlaceholder="작품명 · 경매 ID"
      filters={[
        { key: 'status', label: '상태', options: STATUS_OPTIONS, initial: initialOf(STATUS_OPTIONS, status) },
      ]}
      emptyTitle="경매가 없어요."
      renderItem={(a) => <AuctionRow a={a} onPress={() => manage(a)} />}
    />
  );
}

const styles = StyleSheet.create({
  // 머리 영역의 좌우 여백을 되돌려 목록 행과 같은 폭으로 둔다
  policy: { marginHorizontal: -16, marginTop: 12 },
});
