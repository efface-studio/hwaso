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
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
