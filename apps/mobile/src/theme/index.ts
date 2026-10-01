import {
  palette,
  radius,
  senior as seniorTokens,
  seniorTypography,
  typography,
  type TypographyToken,
} from '@shop/tokens';
import { createContext, useContext } from 'react';
import { Dimensions, useColorScheme, type TextStyle } from 'react-native';
import { BREAKPOINT } from '@/hooks/use-layout';
import { usePrefs } from '@/stores/prefs';

export type Colors = Record<keyof typeof palette.light, string>;

const FONT_WEIGHT: Record<number, TextStyle['fontWeight']> = {
  400: '400',
  500: '500',
  600: '600',
  700: '700',
};

type Scheme = 'light' | 'dark';

/** 강조 색 계열: brand(초록, 사용자 앱) · admin(보라, 관리자 앱) */
export type Accent = 'brand' | 'admin';

/** 관리자 앱 강조 색 — 사용자 앱과 한눈에 구분되게. 글자 대비는 라이트 흰 글자, 다크 어두운 글자 기준 4.5:1 이상 */
const ADMIN_ACCENT: Record<Scheme, Partial<Colors>> = {
  light: {
    primary: '#6B46C1',
    primaryHover: '#5B3AA8',
    primarySoft: '#6B46C112',
    primaryForeground: '#FFFFFF',
    focusRing: '#6B46C1',
  },
  dark: {
    primary: '#A68BF0',
    primaryHover: '#B9A3F4',
    primarySoft: '#A68BF024',
    primaryForeground: '#140B24',
    focusRing: '#A68BF0',
  },
};

const AccentContext = createContext<Accent>('brand');
/** 이 아래의 화면은 useTheme() 의 강조 색(primary 계열)이 accent 로 바뀐다 */
export const AccentProvider = AccentContext.Provider;

/**
 * 태블릿(아이패드·안드로이드 태블릿)에서 글자·컨트롤을 키우는 배율. 휴대폰 크기 그대로면 넓은 화면에서 글자와 버튼이
 * 작아 보인다 — 글자 크기·행간, 컨트롤 높이, 최소 터치 영역, 기본 아이콘 크기에 곱한다 (휴대폰은 1).
 * 앱은 세로 전용이라 기기 화면의 짧은 변으로 한 번만 정한다 (docs/MOBILE_NAVIGATION.md 「화면 폭과 배치」).
 */
export const TABLET_SCALE = 1.2;
const screen = Dimensions.get('screen');
/** 태블릿 기기 (화면 짧은 변 600 이상) */
export const IS_TABLET = Math.min(screen.width, screen.height) >= BREAKPOINT.regular;
const scale = IS_TABLET ? TABLET_SCALE : 1;
/**
 * 탭 바 아이콘·글자 배율. 아이패드도 아이폰과 같은 아래쪽 떠 있는 탭 바를 쓰는데(react-native-screens 패치),
 * 탭 바 높이·폭은 시스템이 고정한다 — 이보다 키우면 아이콘과 글자가 겹친다 (2배에서 겹침 확인).
 */
export const TAB_BAR_SCALE = IS_TABLET ? 1.2 : 1;

function buildTheme(scheme: Scheme, senior: boolean, accent: Accent) {
  const base = palette[scheme];
  const colors: Colors = {
    ...base,
    ...(senior ? seniorTokens.colors[scheme] : {}),
    ...(accent === 'admin' ? ADMIN_ACCENT[scheme] : {}),
  };

  // 글자 스타일은 토큰마다 한 번만 만든다 (Text 가 렌더될 때마다 새 객체를 만들지 않게)
  const typeCache = new Map<TypographyToken, TextStyle>();
  const type = (t: TypographyToken): TextStyle => {
    let style = typeCache.get(t);
    if (!style) {
      const s = senior ? seniorTypography[t] : typography[t];
      const tok = typography[t];
      const size = Math.round(s.size * scale);
      style = {
        fontSize: size,
        lineHeight: Math.round(s.lineHeight * scale),
        fontWeight: FONT_WEIGHT[tok.weight],
        letterSpacing: tok.tracking * size,
      };
      typeCache.set(t, style);
    }
    return style;
  };

  const inputLineHeight = Math.round(
    (senior ? seniorTypography.body.size : typography.body.size) * scale * 1.34,
  );
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
    /** 태블릿 배율 (휴대폰 1) — 고정 크기(카드 폭 등)를 태블릿에서 키울 때 곱한다 */
    scale,
    /** 최소 터치 영역 */
    touch: Math.round((senior ? seniorTokens.touchTarget : 44) * scale),
    controlHeight: Math.round((senior ? seniorTokens.controlHeight : 48) * scale),
    /** 기본 아이콘 크기 */
    iconSize: Math.round((senior ? 26 : 22) * scale),
  };
}

/** 조합(라이트·다크 × 시니어 × 강조 색)은 여덟 가지뿐이라 한 번 만든 테마를 계속 쓴다 — 같은 객체라 의존성 비교에도 안전하다 */
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
  const accent = useContext(AccentContext);
  const scheme: Scheme = theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : theme;
  const key = `${scheme}:${senior ? 1 : 0}:${accent}`;
  let built = themes.get(key);
  if (!built) {
    built = buildTheme(scheme, senior, accent);
    themes.set(key, built);
  }
  return built;
}

export type Theme = ReturnType<typeof useTheme>;
