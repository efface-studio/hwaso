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

type Scheme = 'light' | 'dark';

function buildTheme(scheme: Scheme, senior: boolean) {
  const base = palette[scheme];
  const colors: Colors = senior ? { ...base, ...seniorTokens.colors[scheme] } : base;

  // 글자 스타일은 토큰마다 한 번만 만든다 (Text 가 렌더될 때마다 새 객체를 만들지 않게)
  const typeCache = new Map<TypographyToken, TextStyle>();
  const type = (t: TypographyToken): TextStyle => {
    let style = typeCache.get(t);
    if (!style) {
      const s = senior ? seniorTypography[t] : typography[t];
      const tok = typography[t];
      style = {
        fontSize: s.size,
        lineHeight: s.lineHeight,
        fontWeight: FONT_WEIGHT[tok.weight],
        letterSpacing: tok.tracking * s.size,
      };
      typeCache.set(t, style);
    }
    return style;
  };

  const inputLineHeight = Math.round((senior ? seniorTypography.body.size : typography.body.size) * 1.34);
  /**
   * 입력창 글자. iOS 한 줄 입력창(UITextField)은 lineHeight 를 주면 남는 행간이 글자 위에 붙어
   * 글자가 아래로 치우친다 — 한 줄일 때는 행간을 빼고 글꼴 기본 높이로 가운데 정렬되게 한다.
   */
  const inputType = (multiline = false): TextStyle => {
    const s = type('body');
    if (!multiline) return { ...s, lineHeight: undefined };
    // 여러 줄은 줄 간격이 필요하지만, 본문 행간(24)은 남는 공간만큼 첫 줄이 내려가 보인다 — 글자 크기에 맞춘 행간
    return { ...s, lineHeight: inputLineHeight };
  };

  return {
    scheme,
    dark: scheme === 'dark',
    senior,
    colors,
    type,
    inputType,
    /** 여러 줄 입력창 한 줄 높이 — 한 줄일 때 가운데 오도록 위아래 여백을 계산할 때 쓴다 */
    inputLineHeight,
    radius,
    space: (n: number) => n * 4,
    /** 최소 터치 영역 */
    touch: senior ? seniorTokens.touchTarget : 44,
    controlHeight: senior ? seniorTokens.controlHeight : 48,
  };
}

/** 조합(라이트·다크 × 시니어)은 네 가지뿐이라 한 번 만든 테마를 계속 쓴다 — 같은 객체라 의존성 비교에도 안전하다 */
const themes = new Map<string, ReturnType<typeof buildTheme>>();

/**
 * 웹과 같은 디자인 토큰(@shop/tokens)으로 만든 앱 테마.
 * 글꼴은 OS 기본(iOS: SF Pro/Apple SD Gothic Neo, Android: Roboto/Noto Sans KR) — 네이티브 느낌을 우선한다.
 */
export function useTheme() {
  const system = useColorScheme();
  // 필요한 값만 구독한다 (앱 잠금 등 다른 설정이 바뀌어도 화면 전체가 다시 그려지지 않게)
  const theme = usePrefs((s) => s.theme);
  const senior = usePrefs((s) => s.senior);
  const scheme: Scheme = theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
  const key = `${scheme}:${senior ? 1 : 0}`;
  let built = themes.get(key);
  if (!built) {
    built = buildTheme(scheme, senior);
    themes.set(key, built);
  }
  return built;
}

export type Theme = ReturnType<typeof useTheme>;
