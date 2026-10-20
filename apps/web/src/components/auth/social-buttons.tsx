'use client';

import { ApiError } from '@shop/api-client';
import type { AuthProvider } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { startOAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { toast } from '@/stores/toast';

/** 각 사 브랜드 가이드의 색·표기를 따른다 (ds.efface.dev social 토큰과 동일 값) */
const BRAND: Record<AuthProvider, { label: string; className: string; icon: React.ReactNode }> = {
  KAKAO: {
    label: '카카오로 계속하기',
    className: 'bg-[#FEE500] text-[#191919] hover:brightness-95',
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path
          fill="currentColor"
          d="M12 3C6.48 3 2 6.47 2 10.75c0 2.77 1.86 5.2 4.66 6.57-.2.74-.74 2.7-.85 3.12-.13.52.19.51.4.37.17-.11 2.62-1.78 3.68-2.5.69.1 1.39.16 2.11.16 5.52 0 10-3.47 10-7.72S17.52 3 12 3Z"
        />
      </svg>
    ),
  },
  NAVER: {
    label: '네이버로 계속하기',
    className: 'bg-[#03C75A] text-white hover:brightness-95',
    icon: (
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path fill="currentColor" d="M16.27 12.84 7.46 0H0v24h7.73V11.16L16.54 24H24V0h-7.73z" />
      </svg>
    ),
  },
  GOOGLE: {
    label: 'Google로 계속하기',
    className: 'border border-border-strong bg-background text-foreground hover:bg-surface-2',
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
        />
        <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
        />
      </svg>
    ),
  },
  APPLE: {
    label: 'Apple로 계속하기',
    className: 'bg-secondary text-secondary-foreground hover:opacity-90',
    icon: (
      // 로고 그림이 24 칸에서 왼쪽으로 1.3 치우쳐 있어(가로 2.35~19.06) viewBox 를 옮겨 가운데 맞춘다
      <svg viewBox="-1.3 0 24 24" className="size-5" aria-hidden>
        <path
          fill="currentColor"
          d="M16.37 12.63c-.03-2.6 2.13-3.86 2.23-3.92-1.22-1.78-3.11-2.02-3.78-2.05-1.6-.16-3.13.95-3.94.95-.82 0-2.07-.93-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.46 7.8 1.3 10.36.87 1.25 1.9 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.29-1.27 3.14-2.53a11 11 0 0 0 1.43-2.93c-.03-.02-2.73-1.05-2.76-4.13ZM13.8 5c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.29.69-3.03 1.56-.66.77-1.25 2-1.09 3.18 1.15.09 2.33-.58 3.05-1.45Z"
        />
      </svg>
    ),
  },
};

const ORDER: AuthProvider[] = ['KAKAO', 'NAVER', 'GOOGLE', 'APPLE'];
const SHOW_UNCONFIGURED =
  process.env.NEXT_PUBLIC_SHOW_UNCONFIGURED_AUTH === 'true' || process.env.NODE_ENV !== 'production';

/** API 에 키가 설정된 provider 만 보여준다 (키만 넣으면 버튼이 나타난다) */
export function useAuthProviders() {
  return useQuery({ queryKey: ['auth-providers'], queryFn: api.auth.providers, staleTime: 10 * 60_000 });
}

export function SocialButtons({ next, mode = 'login' }: { next?: string; mode?: 'login' | 'link' }) {
  const { data, refetch } = useAuthProviders();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  // 운영: 키가 설정된 방식만 노출. 개발: 모든 버튼을 보여주고 미설정이면 안내한다
  // 서버가 응답하지 않아 목록을 모르면 버튼을 숨기지 않고 모두 보여준다 (누를 때 다시 확인)
  const visible = SHOW_UNCONFIGURED || !data ? ORDER : ORDER.filter((p) => data.oauth.includes(p));
  if (!visible.length) return null;

  const go = async (p: AuthProvider) => {
    let providers = data;
    if (!providers) {
      setBusy(p);
      providers = (await refetch()).data;
      setBusy(null);
      if (!providers) {
        toast.error('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
    }
    if (!providers.oauth.includes(p)) {
      toast.show(`${PROVIDER_LABEL[p]} 로그인은 API 키 설정 후 사용할 수 있어요 (apps/api/.env)`);
      return;
    }
    setBusy(p);
    try {
      await startOAuth(p, mode, next);
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {visible.map((p) => (
        <button
          key={p}
          type="button"
          disabled={busy !== null}
          onClick={() => void go(p)}
          className={cn(
            'relative flex h-12 w-full items-center justify-center gap-2 rounded-sm text-body-strong transition disabled:opacity-60',
            BRAND[p].className,
          )}
        >
          <span className="absolute left-4 inline-flex">{BRAND[p].icon}</span>
          {busy === p ? '이동 중…' : BRAND[p].label}
        </button>
      ))}
    </div>
  );
}

export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  KAKAO: '카카오',
  NAVER: '네이버',
  GOOGLE: 'Google',
  APPLE: 'Apple',
};
export { BRAND as SOCIAL_BRAND };
