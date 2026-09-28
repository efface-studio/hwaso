import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@shop/api-client';
// expo-router 는 React Navigation 을 내장한다 — 테마도 expo-router 에서 가져와야 같은 컨텍스트를 쓴다
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { refreshAccessToken } from '@/lib/api';
import { AppSync } from '@/lib/realtime-sync';
import { useAuthStore } from '@/stores/auth';
import { usePrefs } from '@/stores/prefs';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

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

function Navigation() {
  const t = useTheme();
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', title: '로그인' }} />
        <Stack.Screen name="signup" options={{ presentation: 'modal', title: '회원가입' }} />
        <Stack.Screen name="forgot-password" options={{ presentation: 'modal', title: '비밀번호 찾기' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="products/[id]/index" options={{ title: '' }} />
        <Stack.Screen
          name="products/[id]/viewer"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
        />
        <Stack.Screen name="search" options={{ title: '검색' }} />
        <Stack.Screen name="auctions/[id]" options={{ title: '경매' }} />
        <Stack.Screen name="chat/[id]" options={{ title: '채팅' }} />
        <Stack.Screen name="notifications" options={{ title: '알림' }} />
        <Stack.Screen name="report" options={{ presentation: 'modal', title: '신고' }} />
        <Stack.Screen name="cart" options={{ title: '장바구니' }} />
        <Stack.Screen name="checkout" options={{ title: '주문서' }} />
        <Stack.Screen name="orders/index" options={{ title: '구매 내역' }} />
        <Stack.Screen name="orders/[id]/index" options={{ title: '주문 상세' }} />
        <Stack.Screen name="orders/[id]/review" options={{ presentation: 'modal', title: '거래 후기' }} />
        <Stack.Screen name="addresses/index" options={{ title: '배송지 관리' }} />
        <Stack.Screen name="addresses/edit" options={{ presentation: 'modal', title: '배송지' }} />
        <Stack.Screen name="bridge" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="sell/new" options={{ presentation: 'fullScreenModal', title: '작품 등록' }} />
        <Stack.Screen name="sell/[id]/edit" options={{ title: '작품 수정' }} />
        <Stack.Screen name="sell/[id]/auction" options={{ title: '경매 등록' }} />
        <Stack.Screen name="seller/register" options={{ title: '판매자 등록' }} />
        <Stack.Screen name="seller/products" options={{ title: '내 작품' }} />
        <Stack.Screen name="seller/settlements" options={{ title: '정산' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [client] = useState(makeClient);
  const ready = useAuthStore((s) => s.ready);
  const hydrated = usePrefs((s) => s.hydrated);

  // 저장된 설정·로그인 상태를 복구한 뒤 스플래시를 내린다
  useEffect(() => {
    void usePrefs.getState().hydrate();
    void refreshAccessToken().finally(() => useAuthStore.getState().markReady());
  }, []);
  useEffect(() => {
    if (ready && hydrated) void SplashScreen.hideAsync();
  }, [ready, hydrated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <Navigation />
          <AppSync />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
