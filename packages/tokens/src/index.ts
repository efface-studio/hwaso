/**
 * 디자인 토큰 단일 원본. docs/DESIGN_SYSTEM.md 와 값을 맞춘다.
 * Web 은 scripts/build-css.ts 로 생성한 tokens.css 를, Mobile 은 이 객체를 직접 쓴다.
 */

export const palette = {
  light: {
    background: '#FFFFFF',
    backgroundSoft: '#FAFAFA',
    surface: '#FFFFFF',
    surface2: '#F5F5F5',
    foreground: '#0A0A0A',
    foreground2: '#171717',
    muted: '#5C5C5C',
    faint: '#8A8A8A',
    border: '#E5E5E5',
    borderSoft: '#F0F0F0',
    borderStrong: '#D4D4D4',
    primary: '#2F7A58',
    primaryHover: '#276849',
    primarySoft: '#2F7A5814',
    primaryForeground: '#FFFFFF',
    secondary: '#0A0A0A',
    secondaryForeground: '#FFFFFF',
    destructive: '#DC2626',
    success: '#1F8A4C',
    warning: '#B45309',
    live: '#DC2626',
    focusRing: '#2F7A58',
    overlay: '#0A0A0A66',
    skeletonBase: '#ECECEF',
    skeletonShine: '#F8F8FA',
  },
  dark: {
    background: '#0A0A0B',
    backgroundSoft: '#101013',
    surface: '#141418',
    surface2: '#1B1B21',
    foreground: '#F6F6F7',
    foreground2: '#EDEDEF',
    muted: '#9B9BA4',
    faint: '#6A6A73',
    border: '#FFFFFF17',
    borderSoft: '#FFFFFF0D',
    borderStrong: '#FFFFFF29',
    primary: '#5FAE86',
    primaryHover: '#74BD97',
    primarySoft: '#5FAE8624',
    primaryForeground: '#07140E',
    secondary: '#F6F6F7',
    secondaryForeground: '#0A0A0B',
    destructive: '#F0443A',
    success: '#4CC38A',
    warning: '#F5A524',
    live: '#F0443A',
    focusRing: '#5FAE86',
    overlay: '#000000A6',
    skeletonBase: '#1B1B21',
    skeletonShine: '#2A2A32',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof (typeof palette)['light'];

export const fontFamily = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  /** Mobile 에서 로드하는 폰트 패밀리 이름 (expo-font) */
  native: {
    regular: 'Pretendard-Regular',
    medium: 'Pretendard-Medium',
    semibold: 'Pretendard-SemiBold',
    bold: 'Pretendard-Bold',
  },
} as const;

export interface TextStyleToken {
  size: number;
  lineHeight: number;
  weight: 400 | 500 | 600 | 700;
  /** em */
  tracking: number;
  /** 모바일(좁은 화면)에서 달라지는 크기 */
  mobile?: { size: number; lineHeight: number };
}

export const typography = {
  display: { size: 40, lineHeight: 48, weight: 700, tracking: -0.02, mobile: { size: 30, lineHeight: 38 } },
  h1: { size: 28, lineHeight: 36, weight: 700, tracking: -0.015, mobile: { size: 22, lineHeight: 30 } },
  h2: { size: 20, lineHeight: 28, weight: 700, tracking: -0.01 },
  h3: { size: 17, lineHeight: 24, weight: 600, tracking: -0.005 },
  body: { size: 15, lineHeight: 24, weight: 400, tracking: 0 },
  bodyStrong: { size: 15, lineHeight: 24, weight: 600, tracking: 0 },
  small: { size: 13, lineHeight: 20, weight: 400, tracking: 0 },
  caption: { size: 12, lineHeight: 16, weight: 400, tracking: 0 },
  label: { size: 13, lineHeight: 18, weight: 500, tracking: 0 },
  price: { size: 16, lineHeight: 22, weight: 700, tracking: -0.01 },
  priceLg: { size: 24, lineHeight: 32, weight: 700, tracking: -0.015 },
} as const satisfies Record<string, TextStyleToken>;

export type TypographyToken = keyof typeof typography;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48, '4xl': 64 } as const;

export const radius = { none: 0, sm: 4, md: 6, lg: 10, full: 9999 } as const;

export const shadow = {
  none: 'none',
  sm: { light: '0 1px 2px rgb(0 0 0 / 0.06)', dark: '0 1px 2px rgb(0 0 0 / 0.4)' },
  md: { light: '0 8px 24px rgb(0 0 0 / 0.12)', dark: '0 8px 24px rgb(0 0 0 / 0.5)' },
} as const;

export const motion = {
  durationFast: 120,
  durationBase: 200,
  easeOut: 'cubic-bezier(.25, 1, .5, 1)',
} as const;

export const layout = {
  maxWidth: 1280,
  gutter: { mobile: 16, tablet: 24, desktop: 32 },
  breakpoints: { tablet: 768, desktop: 1024, wide: 1280 },
  touchTarget: 44,
} as const;
