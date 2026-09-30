import { demoMediaUri } from '@/demo/demo-fetch';
import { env } from './env';

export type ImageWidth = 400 | 800 | 1600;

/** 서버가 만든 파생 이미지 (앱은 WebP 를 모든 OS 에서 지원) */
/** 시연 모드에서는 앱에 담긴 이미지(w800 하나)로 바꾼다 */
export const mediaUrl = (key: string, width: ImageWidth = 800) =>
  demoMediaUri(key) ?? `${env.mediaUrl}/${key}/w${width}.webp`;
