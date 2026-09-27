import { env } from './env';

export const IMAGE_WIDTHS = [400, 800, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/** 서버가 만든 파생 이미지 URL (docs/ARCHITECTURE.md §6) */
export function mediaUrl(key: string, width: ImageWidth = 800, format: 'webp' | 'avif' = 'webp'): string {
  return `${env.mediaUrl}/${key}/w${width}.${format}`;
}

export function mediaSrcSet(key: string, format: 'webp' | 'avif' = 'webp'): string {
  return IMAGE_WIDTHS.map((w) => `${mediaUrl(key, w, format)} ${w}w`).join(', ');
}
