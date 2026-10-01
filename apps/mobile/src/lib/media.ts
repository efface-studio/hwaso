import { PixelRatio } from 'react-native';
import { demoMediaUri } from '@/demo/demo-fetch';
import { env } from './env';

/** 서버 파생본 폭 (apps/api media/image.ts VARIANT_WIDTHS) */
export const IMAGE_WIDTHS = [400, 800, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/** 서버가 만든 파생 이미지 (앱은 WebP 를 모든 OS 에서 지원) */
/** 시연 모드에서는 앱에 담긴 이미지(w800 하나)로 바꾼다 */
export const mediaUrl = (key: string, width: ImageWidth = 800) =>
  demoMediaUri(key) ?? `${env.mediaUrl}/${key}/w${width}.webp`;

/**
 * 필요한 픽셀의 이 비율까지는 한 단계 작은 파생본으로 충분하다고 본다.
 * 예: 홈 가로 목록 카드(140pt × 3배 = 420px)는 w400 으로 — 5% 차이는 보이지 않고 용량은 1/4 이다.
 */
const DOWNSCALE_TOLERANCE = 0.9;

/**
 * 화면에 그려질 폭(pt)에 맞는 파생본: 폭 × 화면 배율 이상인 가장 작은 것 (없으면 가장 큰 것).
 * 휴대폰 2열 카드(약 190pt × 3배 ≈ 570px)는 w800, 썸네일·아바타는 w400.
 */
export function imageWidthFor(displayWidth: number, ratio = PixelRatio.get()): ImageWidth {
  const need = displayWidth * ratio * DOWNSCALE_TOLERANCE;
  return IMAGE_WIDTHS.find((w) => w >= need) ?? 1600;
}
