import { randomBytes } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

/** docs/SECURITY.md — 확장자/Content-Type 을 믿지 않고 실제 디코딩 결과로 판단한다 */
export const ALLOWED_FORMATS = ['jpeg', 'png', 'webp', 'heif', 'avif'] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 50_000_000;
export const VARIANT_WIDTHS = [400, 800, 1600] as const;
const MAX_VARIANT_WIDTH = Math.max(...VARIANT_WIDTHS);

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

  // 한 번만 디코딩: 방향 적용 + 가장 큰 파생본 폭으로 줄인 픽셀을 raw 로 들고 작은 파생본은 여기서 만든다
  const { width, height } = meta.autoOrient;
  let base: { data: Buffer; info: OutputInfo };
  try {
    base = await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: MAX_VARIANT_WIDTH, withoutEnlargement: true })
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError('decode failed');
  }
  const raw = { raw: { width: base.info.width, height: base.info.height, channels: base.info.channels } };
  const fromBase = () => sharp(base.data, raw);

  // 대표색은 64px 썸네일로 계산한다 (stats() 는 입력 전체를 읽는다)
  const thumb = await fromBase()
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { dominant } = await sharp(thumb.data, {
    raw: { width: thumb.info.width, height: thumb.info.height, channels: thumb.info.channels },
  }).stats();

  const key = newImageKey();
  const jobs: Promise<ProcessedImage['variants'][number]>[] = [];
  for (const w of VARIANT_WIDTHS) {
    const resized = fromBase().resize({ width: w, withoutEnlargement: true });
    jobs.push(
      resized
        .clone()
        .webp({ quality: 82 })
        .toBuffer()
        .then((body) => ({ path: `${key}/w${w}.webp`, body, contentType: 'image/webp' })),
    );
    if (opts.avif !== false) {
      jobs.push(
        resized
          .clone()
          .avif({ quality: 55, effort: 3 })
          .toBuffer()
          .then((body) => ({ path: `${key}/w${w}.avif`, body, contentType: 'image/avif' })),
      );
    }
  }
  const variants = await Promise.all(jobs);

  return {
    key,
    width,
    height,
    dominantColor: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    originalFormat: meta.format,
    variants,
  };
}
