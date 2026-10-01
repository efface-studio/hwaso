import { useWindowDimensions, type ViewStyle } from 'react-native';

/**
 * 화면 폭 구간 (docs/MOBILE_NAVIGATION.md 「화면 폭과 배치」).
 * 앱은 세로 전용이고 기기 종류가 아니라 창 폭으로 나눈다 (아이패드 세로 폭은 744 ~ 1032).
 * - compact: 600 미만 (휴대폰)
 * - regular: 600 ~ 1023 (아이패드 mini·11")
 * - wide: 1024 이상 (아이패드 13")
 */
export const BREAKPOINT = { regular: 600, wide: 1024 } as const;
/** 상세 화면(작품·경매)을 사진 | 정보 두 칸으로 나누는 폭 */
export const SPLIT_MIN_WIDTH = 900;
/** 글·폼·목록 화면의 본문 최대 폭 */
export const READABLE_WIDTH = 720;
/** 입력칸 몇 개뿐인 인증 폼(가입·비밀번호 찾기)의 최대 폭 — 로그인 화면과 비슷한 폭 */
export const NARROW_WIDTH = 520;

export type SizeClass = 'compact' | 'regular' | 'wide';

export function sizeClassOf(width: number): SizeClass {
  return width >= BREAKPOINT.wide ? 'wide' : width >= BREAKPOINT.regular ? 'regular' : 'compact';
}

/**
 * 본문 폭 제한: 넓은 화면에서 READABLE_WIDTH 로 줄여 가운데 둔다.
 * 스크롤 화면의 contentContainerStyle 에 넣는다 — 휴대폰은 폭이 이보다 좁아 그대로다.
 */
export const readable: ViewStyle = { width: '100%', maxWidth: READABLE_WIDTH, alignSelf: 'center' };

/** 현재 창 크기와 폭 구간 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const size = sizeClassOf(width);
  return {
    width,
    height,
    size,
    /** 휴대폰보다 넓은 창 (regular·wide) */
    roomy: size !== 'compact',
    /** 상세 화면을 두 칸으로 나눌 만큼 넓은 창 */
    split: width >= SPLIT_MIN_WIDTH,
  };
}

/**
 * 화면 끝까지 닿는 바(하단 고정 버튼·입력창)의 좌우 여백. 배경·구분선은 화면 폭 그대로 두고
 * 안의 내용만 readable 본문과 같은 폭에 오게 한다 (휴대폰에서는 padding 그대로).
 */
export function useReadableGutter(padding = 16) {
  const { width } = useWindowDimensions();
  return Math.max(padding, (width - READABLE_WIDTH) / 2 + padding);
}
