import {
  palette,
  radius,
  senior as seniorTokens,
  seniorTypography,
  typography,
  type TypographyToken,
} from '@shop/tokens';
import { useColorScheme, type TextStyle } from 'react-native';
import { usePrefs } from '@/stores/prefs';

export type Colors = Record<keyof typeof palette.light, string>;

const FONT_WEIGHT: Record<number, TextStyle['fontWeight']> = {
  400: '400',
  500: '500',
  600: '600',
  700: '700',
};

/**
 * 웹과 같은 디자인 토큰(@shop/tokens)으로 만든 앱 테마.
 * 글꼴은 OS 기본(iOS: SF Pro/Apple SD Gothic Neo, Android: Roboto/Noto Sans KR) — 네이티브 느낌을 우선한다.
 */
export function useTheme() {
  const system = useColorScheme();
  const { theme, senior } = usePrefs();
  const scheme = theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
  const base = palette[scheme];
  const colors: Colors = senior ? { ...base, ...seniorTokens.colors[scheme] } : base;

  const type = (t: TypographyToken): TextStyle => {
    const s = senior ? seniorTypography[t] : typography[t];
    const tok = typography[t];
    return {
      fontSize: s.size,
      lineHeight: s.lineHeight,
      fontWeight: FONT_WEIGHT[tok.weight],
      letterSpacing: tok.tracking * s.size,
    };
  };

  return {
    scheme,
    dark: scheme === 'dark',
    senior,
    colors,
    type,
    radius,
    space: (n: number) => n * 4,
    /** 최소 터치 영역 */
    touch: senior ? seniorTokens.touchTarget : 44,
    controlHeight: senior ? seniorTokens.controlHeight : 48,
  };
}

export type Theme = ReturnType<typeof useTheme>;
