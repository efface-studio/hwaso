import {
  PRODUCT_STATUSES,
  VERIFICATION_LABEL,
  VERIFICATION_STATUSES,
  formatPrice,
  type AdminProductRow,
  type ProductStatus,
} from '@shop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { AdminList, useAdminAction, type AdminFilter } from '@/components/admin/admin-list';
import { promptReason } from '@/components/admin/prompt';
import { AdminRow } from '@/components/admin/row';
import { StatusText, type StatusTone } from '@/components/admin/status';
import { type SheetOption, actionSheet } from '@/lib/action-sheet';
import { dt } from '@/lib/admin';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

/** 관리자 목록 표기 (웹 관리자와 같은 짧은 라벨) */
const STATUS: Record<ProductStatus, string> = {
  ACTIVE: '판매 중',
  RESERVED: '거래 중',
  SOLD: '판매 완료',
  DRAFT: '임시',
  HIDDEN: '판매 중지',
  SUSPENDED: '운영 정지',
  PENDING_REVIEW: '검수 중',
};

const STATUS_OPTIONS = PRODUCT_STATUSES.map((s) => ({ value: s, label: STATUS[s] }));
const VERIFICATION_OPTIONS = VERIFICATION_STATUSES.map((s) => ({ value: s, label: VERIFICATION_LABEL[s] }));

const THUMB = 44;
/** 구분선을 글자 시작점까지 들여 쓴다 (여백 16 + 썸네일 + 간격 12) */
const THUMB_INSET = 16 + THUMB + 12;

/** 딥링크로 받은 값이 필터에 있는 값일 때만 처음 값으로 쓴다 */
const initialOf = (options: { value: string }[], v: string | undefined) =>
  options.some((o) => o.value === v) ? v : undefined;

type Status = { label: string; tone: StatusTone };

/** 가장 눈여겨볼 상태 하나만: 삭제 > 운영 정지 > 신고 > 인증서 검수 대기·반려 > 판매 중이 아닌 상태 > 검수 완료 */
function statusOf(p: AdminProductRow): Status | null {
  if (p.deletedAt) return { label: '삭제됨', tone: 'negative' };
  if (p.status === 'SUSPENDED') return { label: STATUS.SUSPENDED, tone: 'negative' };
  if (p.reportCount > 0) return { label: `신고 ${p.reportCount}`, tone: 'negative' };
  if (p.certificate && p.verificationStatus === 'PENDING') return { label: '검수 대기', tone: 'warning' };
  if (p.certificate && p.verificationStatus === 'REJECTED')
    return { label: VERIFICATION_LABEL.REJECTED, tone: 'warning' };
  if (p.status === 'PENDING_REVIEW') return { label: STATUS.PENDING_REVIEW, tone: 'warning' };
  if (p.status !== 'ACTIVE') return { label: STATUS[p.status], tone: 'neutral' };
  if (p.certificate && p.verificationStatus === 'VERIFIED') return { label: '검수 완료', tone: 'positive' };
  return null;
}

/** 작품 한 줄: 썸네일 · 작품명과 가격 · 판매자와 인증서 · 대표 상태 · 등록일(상태에 안 나온 신고 수) */
function ProductRow({ p, onPress }: { p: AdminProductRow; onPress: () => void }) {
  const t = useTheme();
  const deleted = !!p.deletedAt;
  const status = statusOf(p);
  const reports = `신고 ${p.reportCount}`;
  const cert = p.certificate ? `인증서 ${p.certificate.issuer} ${p.certificate.number}` : null;
  return (
    <AdminRow
      leading={
        <View style={[styles.thumb, { backgroundColor: t.colors.surface2 }]}>
          {p.image && (
            <Image
              source={mediaUrl(p.image.key, 400)}
              recyclingKey={p.id}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessible={false}
            />
          )}
        </View>
      }
      title={p.title}
      value={p.price != null ? formatPrice(p.price) : undefined}
      detail={[p.seller.nickname, p.price == null ? '경매' : null, cert].filter(Boolean).join(' · ')}
      status={status && <StatusText label={status.label} tone={status.tone} />}
      meta={[dt(p.createdAt), p.reportCount > 0 && status?.label !== reports ? reports : null]
        .filter(Boolean)
        .join(' · ')}
      dimmed={deleted}
      disabled={deleted}
      chevron={!deleted}
      accessibilityLabel={[
        p.title,
        p.seller.nickname,
        p.price != null ? formatPrice(p.price) : '경매',
        deleted ? '삭제됨' : STATUS[p.status],
        p.certificate ? VERIFICATION_LABEL[p.verificationStatus] : null,
        p.reportCount > 0 ? reports : null,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={deleted ? undefined : '눌러서 관리 메뉴 열기'}
      onPress={onPress}
    />
  );
}

/** 작품 · 검수: 신고가 쌓인 작품을 비공개하고, 인증서 원본을 대조해 플랫폼 검수 표시를 붙인다 */
export function ProductList({
  header,
  status,
  verification,
}: {
  header: ReactNode;
  status?: string;
  verification?: string;
}) {
  const inv = ['products', 'dashboard'];
  const hide = useAdminAction(api.admin.hideProduct, '비공개 처리했어요', inv);
  const restore = useAdminAction(api.admin.restoreProduct, '비공개를 해제했어요', inv);
  const remove = useAdminAction(api.admin.deleteProduct, '삭제했어요', inv);
  const review = useAdminAction(api.admin.reviewCertificate, '검수 결과를 반영했어요', inv);

  const filters: AdminFilter[] = [
    { key: 'status', label: '상태', options: STATUS_OPTIONS, initial: initialOf(STATUS_OPTIONS, status) },
    {
      key: 'verification',
      label: '검수',
      options: VERIFICATION_OPTIONS,
      initial: initialOf(VERIFICATION_OPTIONS, verification),
    },
  ];

  const manage = (p: AdminProductRow) => {
    const cert = p.certificate;
    const options: SheetOption[] = [
      {
        label: '작품 보기',
        onPress: () => router.push({ pathname: '/products/[id]', params: { id: p.id } }),
      },
    ];
    if (cert?.imageKey) {
      const url = mediaUrl(cert.imageKey, 1600);
      options.push({ label: '인증서 원본 보기', onPress: () => void WebBrowser.openBrowserAsync(url) });
    }
    if (cert && p.verificationStatus !== 'VERIFIED')
      options.push({
        label: '인증서 승인',
        onPress: () =>
          Alert.alert('인증서를 승인할까요?', `${p.title} — 플랫폼 검수 완료로 표시돼요.`, [
            { text: '취소', style: 'cancel' },
            { text: '승인', onPress: () => review.mutate([p.id, 'VERIFIED', '']) },
          ]),
      });
    if (cert)
      options.push({
        label: '인증서 반려',
        destructive: true,
        onPress: async () => {
          const note = await promptReason({
            title: '인증서 반려',
            description: p.title,
            label: '반려 사유 (판매자에게 안내돼요)',
            confirmLabel: '반려',
            destructive: true,
            required: false,
          });
          if (note !== null) review.mutate([p.id, 'REJECTED', note]);
        },
      });
    if (p.status !== 'SUSPENDED')
      options.push({
        label: '운영 비공개',
        destructive: true,
        onPress: async () => {
          const r = await promptReason({
            title: '운영 비공개',
            description: p.title,
            confirmLabel: '비공개',
            destructive: true,
          });
          if (r !== null) hide.mutate([p.id, r]);
        },
      });
    else
      options.push({
        label: '비공개 해제',
        onPress: async () => {
          const r = await promptReason({ title: '비공개 해제', description: p.title, confirmLabel: '해제' });
          if (r !== null) restore.mutate([p.id, r]);
        },
      });
    options.push({
      label: '삭제',
      destructive: true,
      onPress: async () => {
        const r = await promptReason({
          title: '작품 삭제',
          description: p.title,
          confirmLabel: '삭제',
          destructive: true,
        });
        if (r !== null) remove.mutate([p.id, r]);
      },
    });
    actionSheet('관리', options);
  };

  return (
    <AdminList
      queryKey="products"
      fetcher={api.admin.products}
      header={header}
      searchPlaceholder="작품명 · ID"
      filters={filters}
      skeleton="list"
      emptyTitle="작품이 없어요."
      separatorInset={THUMB_INSET}
      renderItem={(p) => <ProductRow p={p} onPress={() => manage(p)} />}
    />
  );
}

const styles = StyleSheet.create({
  thumb: { width: THUMB, height: THUMB, borderRadius: 6, overflow: 'hidden' },
});
