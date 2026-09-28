import { env } from './env';

export type ImageWidth = 400 | 800 | 1600;

/** 서버가 만든 파생 이미지 (앱은 WebP 를 모든 OS 에서 지원) */
export const mediaUrl = (key: string, width: ImageWidth = 800) => `${env.mediaUrl}/${key}/w${width}.webp`;
