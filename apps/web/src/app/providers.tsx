'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@shop/api-client';
import { useEffect, useState, type ReactNode } from 'react';
import { ConsentGate } from '@/components/auth/consent-gate';
import { Toaster } from '@/components/ui/toaster';
import { refreshAccessToken } from '@/lib/api';
import { RealtimeSync } from '@/lib/realtime-sync';
import { hasSessionHint, useAuthStore } from '@/stores/auth';
import { useSeniorStore } from '@/stores/senior';
import { useThemeStore } from '@/stores/theme';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // 4xx 는 재시도해도 결과가 같다
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

/** 앱 부팅 시 refresh 쿠키로 access 토큰을 복구한다 */
function AuthBootstrap() {
  useEffect(() => {
    if (useAuthStore.getState().ready) return;
    // 로그인한 적 없는 브라우저는 refresh 쿠키도 없으므로 요청하지 않는다
    if (!hasSessionHint()) return useAuthStore.getState().markReady();
    void refreshAccessToken().finally(() => useAuthStore.getState().markReady());
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  useEffect(() => {
    useThemeStore.getState().hydrate();
    useSeniorStore.getState().hydrate();
  }, []);
  return (
    <QueryClientProvider client={client}>
      <AuthBootstrap />
      <ConsentGate />
      <RealtimeSync />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
