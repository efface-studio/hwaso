import { ThemeProvider, useTheme as useNavigationTheme } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { PromptHost } from '@/components/admin/prompt';
import { ADMIN_TAB_ICONS, useTabIconSet } from '@/components/tab-icons';
import { AccentProvider, useTheme } from '@/theme';

/** 관리자 탭 이름·라벨·대체 SF Symbol (아이콘 이미지가 준비되기 전 첫 프레임) */
const TABS: { name: keyof typeof ADMIN_TAB_ICONS; label: string; sf: SFSymbol; md: AndroidSymbol }[] = [
  { name: 'dashboard', label: '요약', sf: 'chart.bar', md: 'monitoring' },
  { name: 'members', label: '회원', sf: 'person.2', md: 'group' },
  { name: 'catalog', label: '작품', sf: 'photo.on.rectangle', md: 'photo_library' },
  { name: 'commerce', label: '거래', sf: 'creditcard', md: 'receipt_long' },
  { name: 'ops', label: '운영', sf: 'wrench.and.screwdriver', md: 'build' },
];

/**
 * 관리자 앱 — 사용자 앱과 같은 네이티브 탭 바 (다섯 칸). 사용자 앱으로 돌아가기는 대시보드 헤더 오른쪽 버튼.
 * iPhone 탭 바는 여섯 칸부터 마지막 칸을 '더 보기'로 접으므로 탭을 늘리지 않는다.
 * 관리자 권한이 없으면 루트 가드(Stack.Protected)가 이 경로를 열지 않는다. 실제 권한 검사는 API 가 한다.
 */
/** 관리자 앱은 강조 색을 보라색으로 — 사용자 앱(초록)과 한눈에 구분된다 */
export default function AdminLayout() {
  return (
    <AccentProvider value="admin">
      <AdminTabs />
    </AccentProvider>
  );
}

function AdminTabs() {
  const t = useTheme();
  const nav = useNavigationTheme();
  const icons = useTabIconSet(ADMIN_TAB_ICONS);
  return (
    // 네이티브 헤더 버튼·뒤로 가기 색도 같은 강조 색으로
    <ThemeProvider value={{ ...nav, colors: { ...nav.colors, primary: t.colors.primary } }}>
      <NativeTabs tintColor={t.colors.primary} labelStyle={{ fontSize: t.senior ? 13 : 11 }}>
        {TABS.map((tab) => {
          const icon = icons[tab.name];
          return (
            <NativeTabs.Trigger key={tab.name} name={tab.name}>
              <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
              {icon ? (
                <NativeTabs.Trigger.Icon src={icon} renderingMode="template" md={tab.md} />
              ) : (
                <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
              )}
            </NativeTabs.Trigger>
          );
        })}
      </NativeTabs>
      <PromptHost />
    </ThemeProvider>
  );
}
