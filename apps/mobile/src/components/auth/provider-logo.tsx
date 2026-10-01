import type { AuthProvider } from '@shop/shared';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Theme } from '@/theme';
import { useTheme } from '@/theme';

/**
 * 각 사 브랜드 가이드의 색·로고 (웹 components/auth/social-buttons.tsx 와 같은 값).
 * Google 은 흰 배경 + 회색 테두리(공식 가이드 기본), Apple 은 테마 반대색(라이트: 검정, 다크: 흰색). size 는 로고 크기 (네이버는 0.8배)
 */
export function providerBrand(
  p: AuthProvider,
  t: Theme,
  size = 20,
): { bg: string; fg: string; border?: string; icon: ReactNode } {
  switch (p) {
    case 'KAKAO':
      return {
        bg: '#FEE500',
        fg: '#191919',
        icon: (
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path
              fill="#191919"
              d="M12 3C6.48 3 2 6.47 2 10.75c0 2.77 1.86 5.2 4.66 6.57-.2.74-.74 2.7-.85 3.12-.13.52.19.51.4.37.17-.11 2.62-1.78 3.68-2.5.69.1 1.39.16 2.11.16 5.52 0 10-3.47 10-7.72S17.52 3 12 3Z"
            />
          </Svg>
        ),
      };
    case 'NAVER':
      return {
        bg: '#03C75A',
        fg: '#FFFFFF',
        icon: (
          <Svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24">
            <Path fill="#FFFFFF" d="M16.27 12.84 7.46 0H0v24h7.73V11.16L16.54 24H24V0h-7.73z" />
          </Svg>
        ),
      };
    case 'GOOGLE':
      return {
        // Google 버튼 가이드의 기본(라이트) 모양 — 다크 모드에서도 흰 배경
        bg: '#FFFFFF',
        fg: '#1F1F1F',
        border: '#747775',
        icon: (
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path
              fill="#4285F4"
              d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
            />
            <Path
              fill="#34A853"
              d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
            />
            <Path
              fill="#FBBC05"
              d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
            />
            <Path
              fill="#EA4335"
              d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
            />
          </Svg>
        ),
      };
    case 'APPLE':
      return {
        bg: t.colors.secondary,
        fg: t.colors.secondaryForeground,
        icon: (
          // 로고 그림이 24 칸에서 왼쪽으로 1.3 치우쳐 있어(가로 2.35~19.06) viewBox 를 옮겨 가운데 맞춘다
          <Svg width={size} height={size} viewBox="-1.3 0 24 24">
            <Path
              fill={t.colors.secondaryForeground}
              d="M16.37 12.63c-.03-2.6 2.13-3.86 2.23-3.92-1.22-1.78-3.11-2.02-3.78-2.05-1.6-.16-3.13.95-3.94.95-.82 0-2.07-.93-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.46 7.8 1.3 10.36.87 1.25 1.9 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.29-1.27 3.14-2.53a11 11 0 0 0 1.43-2.93c-.03-.02-2.73-1.05-2.76-4.13ZM13.8 5c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.29.69-3.03 1.56-.66.77-1.25 2-1.09 3.18 1.15.09 2.33-.58 3.05-1.45Z"
            />
          </Svg>
        ),
      };
  }
}

/** 원형 소셜 로고 (설정 목록 등 작은 자리). dim 이면 흐리게 — 연결 안 된 계정 */
export function ProviderBadge({
  provider,
  size = 24,
  dim,
}: {
  provider: AuthProvider;
  size?: number;
  dim?: boolean;
}) {
  const t = useTheme();
  const b = providerBrand(provider, t, Math.round(size * 0.58));
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: b.bg,
          borderColor: b.border ?? b.bg,
          opacity: dim ? 0.3 : 1,
        },
      ]}
    >
      {b.icon}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
