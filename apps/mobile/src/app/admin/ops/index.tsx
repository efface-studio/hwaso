import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AdminRow, RowSection } from '@/components/admin/row';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type MenuItem = {
  href: Href;
  label: string;
  description: string;
  sf: SFSymbol;
  md: AndroidSymbol;
  /** 처리할 건수 (0 이면 숨김) */
  count?: number;
};

const ICON = 22;
const INSET = 16 + ICON + 14;

function MenuRow({ item }: { item: MenuItem }) {
  const count = item.count ?? 0;
  return (
    <AdminRow
      leading={
        <View style={styles.icon}>
          <Icon ios={item.sf} android={item.md} color="muted" size={ICON - 2} />
        </View>
      }
      title={
        <Text variant="body" numberOfLines={1}>
          {item.label}
        </Text>
      }
      value={
        count > 0 ? (
          <Text variant="bodyStrong" color="destructive" style={{ fontVariant: ['tabular-nums'] }}>
            {count > 99 ? '99+' : count}
          </Text>
        ) : undefined
      }
      detail={item.description}
      accessibilityRole="link"
      accessibilityLabel={count > 0 ? `${item.label}, 처리할 ${count}건` : item.label}
      accessibilityHint={item.description}
      onPress={() => router.push(item.href)}
    />
  );
}

/** 운영 메뉴: 신고·카테고리·경매 정책·콘텐츠·쿠폰·앱 업데이트·감사 로그 */
export default function OpsScreen() {
  const t = useTheme();
  // 신고 옆에 열린 신고 수 (대시보드와 같은 캐시)
  const dash = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: api.admin.dashboard });
  const pull = usePullRefresh(dash.refetch);
  const openReports = dash.data?.issues.openReports;

  const groups: [string, MenuItem[]][] = [
    [
      '회원 관리',
      [
        {
          href: '/admin/ops/reports',
          label: '신고',
          description: '작품·회원·후기·메시지 신고 처리',
          sf: 'exclamationmark.bubble',
          md: 'report',
          count: openReports,
        },
      ],
    ],
    [
      '작품·경매',
      [
        {
          href: '/admin/ops/categories',
          label: '카테고리',
          description: '분류 추가·수정·숨김',
          sf: 'square.grid.2x2',
          md: 'category',
        },
        {
          href: '/admin/ops/policy',
          label: '경매 정책',
          description: '마감 연장·결제 기한·경매 기간',
          sf: 'hammer',
          md: 'gavel',
        },
      ],
    ],
    [
      '콘텐츠',
      [
        {
          href: '/admin/ops/banners',
          label: '배너',
          description: '홈 상단 배너 노출 관리',
          sf: 'rectangle.on.rectangle',
          md: 'view_carousel',
        },
        {
          href: '/admin/ops/notices',
          label: '공지사항',
          description: '공지 작성·고정',
          sf: 'megaphone',
          md: 'campaign',
        },
        {
          href: '/admin/ops/broadcast',
          label: '전체 알림',
          description: '회원에게 알림 보내기',
          sf: 'bell.badge',
          md: 'notifications_active',
        },
      ],
    ],
    [
      '거래',
      [
        {
          href: '/admin/ops/coupons',
          label: '쿠폰',
          description: '할인 쿠폰 발급·기간 관리',
          sf: 'ticket',
          md: 'confirmation_number',
        },
      ],
    ],
    [
      '앱',
      [
        {
          href: '/admin/ops/updates',
          label: '앱 업데이트',
          description: '배포 기록·배포 비율·되돌리기',
          sf: 'arrow.down.app',
          md: 'system_update',
        },
      ],
    ],
    [
      '기록',
      [
        {
          href: '/admin/ops/audit',
          label: '감사 로그',
          description: '관리자 변경 기록 (수정·삭제 불가)',
          sf: 'list.bullet.rectangle',
          md: 'history',
        },
      ],
    ],
  ];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      {groups.map(([group, items]) => (
        <RowSection key={group} title={group} inset={INSET}>
          {items.map((item) => (
            <MenuRow key={item.label} item={item} />
          ))}
        </RowSection>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 48 },
  icon: { width: ICON, alignItems: 'center' },
});
