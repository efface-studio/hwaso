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
import { useTranslation } from 'react-i18next';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/i18n';
import { ActionSheetHost } from '@/components/action-sheet-host';
import { AnimatedSplash } from '@/components/animated-splash';
import { AppLock } from '@/components/app-lock';
import { OfflineBanner } from '@/components/offline-banner';
import { PushPromptHost } from '@/components/push-prompt-host';
import { preloadTabIcons } from '@/components/tab-icons';
import { WelcomeHost } from '@/components/welcome-host';
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
const modal = (title: string, closeLabel: string): NativeStackNavigationOptions => ({
  presentation: 'modal',
  title,
  unstable_headerLeftItems: () => [
    {
      type: 'button',
      label: closeLabel,
      icon: { type: 'sfSymbol', name: 'xmark' },
      onPress: () => router.back(),
    },
  ],
});

function Navigation() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const signedIn = !!user;
  // 필수 약관 동의가 남았으면 동의 화면만 (서버도 동의 전 쓰기 요청을 막는다)
  const consentPending = !!user?.consentRequired;
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
        {/* 약관 동의가 남은 계정은 동의 화면만 열린다 (소셜 첫 로그인 등). 동의하면 가드가 바뀌며 홈으로 */}
        <Stack.Protected guard={consentPending}>
          <Stack.Screen name="consent" options={{ title: tr('screen.consent'), gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!consentPending}>
          {/* 둘러보기: 탭·작품·경매·프로필·공지·고객센터는 로그인하지 않아도 본다 */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="products/[id]/index" options={{ title: '' }} />
          <Stack.Screen
            name="products/[id]/viewer"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
          <Stack.Screen name="search" options={{ title: tr('screen.search') }} />
          <Stack.Screen name="auctions/[id]" options={{ title: tr('screen.auction') }} />
          <Stack.Screen name="users/[id]/index" options={{ title: '' }} />
          <Stack.Screen name="users/[id]/follows" options={{ title: tr('screen.followers') }} />
          <Stack.Screen name="notices/index" options={{ title: tr('screen.notices') }} />
          <Stack.Screen name="notices/[id]" options={{ title: tr('screen.notices') }} />
          <Stack.Screen name="support" options={{ title: tr('screen.support') }} />
          {/* 로그인은 첫 화면이 아니라 필요할 때 띄우는 화면 — 로그인하면 가드가 빼 주어 보던 화면으로 돌아간다 */}
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="login" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
            <Stack.Screen name="signup" options={{ title: tr('screen.signup') }} />
            <Stack.Screen name="forgot-password" options={{ title: tr('screen.forgotPassword') }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            {/* 관리자 앱: 관리자 계정에만 열린다 (실제 권한 검사는 API) */}
            <Stack.Protected guard={admin}>
              <Stack.Screen name="admin" options={{ headerShown: false, animation: 'fade' }} />
            </Stack.Protected>
            <Stack.Screen name="chat/[id]" options={{ title: tr('screen.chat') }} />
            <Stack.Screen name="notifications" options={{ title: tr('screen.notifications') }} />
            <Stack.Screen name="report" options={modal(tr('screen.report'), tr('action.close'))} />
            <Stack.Screen name="cart" options={{ title: tr('screen.cart') }} />
            <Stack.Screen name="checkout" options={{ title: tr('screen.checkout') }} />
            <Stack.Screen name="orders/index" options={{ title: tr('screen.orders') }} />
            <Stack.Screen name="orders/[id]/index" options={{ title: tr('screen.orderDetail') }} />
            <Stack.Screen
              name="orders/[id]/review"
              options={modal(tr('screen.review'), tr('action.close'))}
            />
            <Stack.Screen name="addresses/index" options={{ title: tr('screen.addresses') }} />
            <Stack.Screen name="addresses/edit" options={modal(tr('screen.address'), tr('action.close'))} />
            <Stack.Screen
              name="sell/new"
              options={{ presentation: 'fullScreenModal', title: tr('screen.sellNew') }}
            />
            <Stack.Screen name="sell/[id]/edit" options={{ title: tr('screen.sellEdit') }} />
            <Stack.Screen name="sell/[id]/auction" options={{ title: tr('screen.auctionNew') }} />
            <Stack.Screen name="seller/register" options={{ title: tr('screen.sellerRegister') }} />
            <Stack.Screen name="seller/products" options={{ title: tr('screen.sellerProducts') }} />
            <Stack.Screen name="seller/settlements" options={{ title: tr('screen.settlements') }} />
            <Stack.Screen name="settings/index" options={{ title: tr('screen.settings') }} />
            <Stack.Screen name="settings/profile" options={{ title: tr('screen.profile') }} />
            <Stack.Screen name="settings/password" options={{ title: tr('screen.password') }} />
            <Stack.Screen name="settings/identity" options={{ title: tr('screen.identity') }} />
            <Stack.Screen name="settings/social" options={{ title: tr('screen.social') }} />
            <Stack.Screen name="settings/devices" options={{ title: tr('screen.devices') }} />
            <Stack.Screen
              name="settings/notifications"
              options={{ title: tr('screen.notificationSettings') }}
            />
            <Stack.Screen name="settings/blocks" options={{ title: tr('screen.blocks') }} />
            <Stack.Screen name="settings/reports" options={{ title: tr('screen.reports') }} />
            <Stack.Screen name="settings/delete" options={{ title: tr('screen.deleteAccount') }} />
            <Stack.Screen name="feed" options={{ title: tr('screen.feed') }} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="bridge" options={{ headerShown: false, animation: 'none' }} />
        {/* 약관은 가입·동의 전에도 본다 */}
        <Stack.Screen name="policies/[slug]" options={{ title: '' }} />
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
          <PushPromptHost />
          <WelcomeHost />
          <AppLock />
          {hydrated && !splashDone && <AnimatedSplash ready={ready} onFinish={finishSplash} />}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
