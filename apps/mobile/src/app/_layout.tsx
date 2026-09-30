import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@shop/api-client';
// expo-router 는 React Navigation 을 내장한다 — 테마도 expo-router 에서 가져와야 같은 컨텍스트를 쓴다
import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider,
  type NativeStackNavigationOptions,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActionSheetHost } from '@/components/action-sheet-host';
import { AnimatedSplash } from '@/components/animated-splash';
import { AppLock } from '@/components/app-lock';
import { OfflineBanner } from '@/components/offline-banner';
import { preloadTabIcons } from '@/components/tab-icons';
import { refreshAccessToken } from '@/lib/api';
import { isAdmin } from '@/lib/admin';
import { guardRapidNavigation } from '@/lib/nav';
import { connectQueryFocus } from '@/lib/query-focus';
import { AppSync } from '@/lib/realtime-sync';
import { useAuthStore } from '@/stores/auth';
import { useLaunch } from '@/stores/launch';
import { usePrefs } from '@/stores/prefs';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();
connectQueryFocus();
preloadTabIcons();
guardRapidNavigation();

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

/** 아래에서 올라오는 모달: 왼쪽 위 닫기 버튼 (쓸어내리기만으로는 닫을 수 있는지 알기 어렵다) */
const modal = (title: string): NativeStackNavigationOptions => ({
  presentation: 'modal',
  title,
  unstable_headerLeftItems: () => [
    {
      type: 'button',
      label: '닫기',
      icon: { type: 'sfSymbol', name: 'xmark' },
      onPress: () => router.back(),
    },
  ],
});

function Navigation() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const signedIn = !!user;
  const admin = isAdmin(user);
  const base = t.dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: t.colors.primary,
          background: t.colors.background,
          card: t.colors.background,
          text: t.colors.foreground,
          border: t.colors.border,
        },
      }}
    >
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTitleStyle: t.type('h3') }}>
        {/* 로그인해야 앱에 들어간다 — 로그인·로그아웃하면 가드가 바뀌며 자동으로 홈/로그인으로 이동한다 */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="signup" options={{ title: '회원가입' }} />
          <Stack.Screen name="forgot-password" options={{ title: '비밀번호 찾기' }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="bridge" options={{ headerShown: false, animation: 'none' }} />
        {/* 약관은 가입 전에도 본다 */}
        <Stack.Screen name="policies/[slug]" options={{ title: '' }} />
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
          {/* 관리자 앱: 관리자 계정에만 열린다 (실제 권한 검사는 API) */}
          <Stack.Protected guard={admin}>
            <Stack.Screen name="admin" options={{ headerShown: false, animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Screen name="products/[id]/index" options={{ title: '' }} />
          <Stack.Screen
            name="products/[id]/viewer"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
          <Stack.Screen name="search" options={{ title: '검색' }} />
          <Stack.Screen name="auctions/[id]" options={{ title: '경매' }} />
          <Stack.Screen name="chat/[id]" options={{ title: '채팅' }} />
          <Stack.Screen name="notifications" options={{ title: '알림' }} />
          <Stack.Screen name="report" options={modal('신고')} />
          <Stack.Screen name="cart" options={{ title: '장바구니' }} />
          <Stack.Screen name="checkout" options={{ title: '주문서' }} />
          <Stack.Screen name="orders/index" options={{ title: '구매 내역' }} />
          <Stack.Screen name="orders/[id]/index" options={{ title: '주문 상세' }} />
          <Stack.Screen name="orders/[id]/review" options={modal('거래 후기')} />
          <Stack.Screen name="addresses/index" options={{ title: '배송지 관리' }} />
          <Stack.Screen name="addresses/edit" options={modal('배송지')} />
          <Stack.Screen name="sell/new" options={{ presentation: 'fullScreenModal', title: '작품 등록' }} />
          <Stack.Screen name="sell/[id]/edit" options={{ title: '작품 수정' }} />
          <Stack.Screen name="sell/[id]/auction" options={{ title: '경매 등록' }} />
          <Stack.Screen name="seller/register" options={{ title: '판매자 등록' }} />
          <Stack.Screen name="seller/products" options={{ title: '내 작품' }} />
          <Stack.Screen name="seller/settlements" options={{ title: '정산' }} />
          <Stack.Screen name="settings/index" options={{ title: '설정' }} />
          <Stack.Screen name="settings/profile" options={{ title: '프로필' }} />
          <Stack.Screen name="settings/password" options={{ title: '비밀번호' }} />
          <Stack.Screen name="settings/identity" options={{ title: '본인인증' }} />
          <Stack.Screen name="settings/social" options={{ title: '연결된 소셜 계정' }} />
          <Stack.Screen name="settings/devices" options={{ title: '로그인 기기' }} />
          <Stack.Screen name="settings/notifications" options={{ title: '알림 설정' }} />
          <Stack.Screen name="settings/blocks" options={{ title: '차단한 사용자' }} />
          <Stack.Screen name="settings/reports" options={{ title: '신고 내역' }} />
          <Stack.Screen name="settings/delete" options={{ title: '회원 탈퇴' }} />
          <Stack.Screen name="users/[id]/index" options={{ title: '' }} />
          <Stack.Screen name="users/[id]/follows" options={{ title: '팔로워' }} />
          <Stack.Screen name="notices/index" options={{ title: '공지사항' }} />
          <Stack.Screen name="notices/[id]" options={{ title: '공지사항' }} />
          <Stack.Screen name="support" options={{ title: '고객센터' }} />
          <Stack.Screen name="feed" options={{ title: '팔로잉 새 작품' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [client] = useState(makeClient);
  const ready = useAuthStore((s) => s.ready);
  const hydrated = usePrefs((s) => s.hydrated);
  const theme = usePrefs((s) => s.theme);

  // 앱 테마를 네이티브 창에도 적용 — 탭 바·헤더 버튼 같은 시스템 UI(Liquid Glass)가 시스템 설정이 아닌 앱 테마를 따른다
  useEffect(() => {
    Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
  }, [theme]);

  // 저장된 설정·로그인 상태를 복구한다 (복구가 끝나야 스플래시가 사라진다)
  useEffect(() => {
    void usePrefs.getState().hydrate();
    void refreshAccessToken().finally(() => useAuthStore.getState().markReady());
  }, []);
  // 네이티브 스플래시는 애니메이션 스플래시가 첫 프레임을 그린 뒤 내린다 (테마를 알아야 하므로 설정 복구 후)
  const splashDone = useLaunch((s) => s.splashDone);
  const finishSplash = useLaunch((s) => s.finishSplash);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <Navigation />
          <AppSync />
          <OfflineBanner />
          <ActionSheetHost />
          <AppLock />
          {hydrated && !splashDone && <AnimatedSplash ready={ready} onFinish={finishSplash} />}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
