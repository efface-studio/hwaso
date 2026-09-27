import { randomBytes } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

/** docs/SECURITY.md — 확장자/Content-Type 을 믿지 않고 실제 디코딩 결과로 판단한다 */
export const ALLOWED_FORMATS = ['jpeg', 'png', 'webp', 'heif', 'avif'] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 50_000_000;
export const VARIANT_WIDTHS = [400, 800, 1600] as const;

export class InvalidImageError extends Error {}

export interface ProcessedImage {
  key: string;
  width: number;
  height: number;
  dominantColor: string;
  originalFormat: string;
  variants: { path: string; body: Buffer; contentType: string }[];
}

const hex = (n: number) => n.toString(16).padStart(2, '0');

/** 서버가 만드는 추측 불가능한 키. 사용자 파일명은 쓰지 않는다 */
export function newImageKey(now = new Date()): string {
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `img/${month}/${randomBytes(12).toString('base64url')}`;
}

/**
 * 이미지 검증 + EXIF 방향 적용 + 메타데이터 제거 + 파생본(WebP/AVIF 400/800/1600) 생성.
 * sharp 는 withMetadata() 를 호출하지 않으면 EXIF/GPS 를 출력에 포함하지 않는다.
 * 재인코딩된 결과만 공개하므로 폴리글랏 파일에 숨긴 스크립트도 제거된다.
 */
export async function processImage(input: Buffer, opts: { avif?: boolean } = {}): Promise<ProcessedImage> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new InvalidImageError('too large');
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new InvalidImageError('decode failed');
  }
  if (!meta.format || !(ALLOWED_FORMATS as readonly string[]).includes(meta.format)) {
    throw new InvalidImageError(`format ${meta.format}`);
  }

  let normalized: { data: Buffer; info: OutputInfo };
  try {
    normalized = await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError('decode failed');
  }
  const { width, height } = normalized.info;
  const { dominant } = await sharp(normalized.data).stats();

  const key = newImageKey();
  const variants: ProcessedImage['variants'] = [];
  for (const w of VARIANT_WIDTHS) {
    const resized = sharp(normalized.data).resize({ width: w, withoutEnlargement: true });
    variants.push({
      path: `${key}/w${w}.webp`,
      body: await resized.clone().webp({ quality: 82 }).toBuffer(),
      contentType: 'image/webp',
    });
    if (opts.avif !== false) {
      variants.push({
        path: `${key}/w${w}.avif`,
        body: await resized.clone().avif({ quality: 55, effort: 3 }).toBuffer(),
        contentType: 'image/avif',
      });
    }
  }

  return {
    key,
    width,
    height,
    dominantColor: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    originalFormat: meta.format,
    variants,
  };
}
