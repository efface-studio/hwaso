import { randomBytes } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { IMAGE_UPLOAD } from '@shop/shared';
import sharp, { type Metadata, type OutputInfo, type Sharp } from 'sharp';

/**
 * docs/SECURITY.md — 확장자/Content-Type 을 믿지 않고 실제 디코딩 결과로 판단한다.
 * gif/tiff 는 첫 프레임(페이지)만 쓴다. svg 는 스크립트·외부 참조 위험으로 계속 거부한다.
 */
export const ALLOWED_FORMATS = ['jpeg', 'png', 'webp', 'heif', 'avif', 'gif', 'tiff'] as const;
export const MAX_UPLOAD_BYTES = IMAGE_UPLOAD.maxBytes;
export const MAX_PIXELS = 100_000_000;
export const VARIANT_WIDTHS = [400, 800, 1600] as const;
const MAX_VARIANT_WIDTH = Math.max(...VARIANT_WIDTHS);
/** HEIC(HEVC) 은 WASM 디코더로 푼다 — 워커 스레드에서 실행해 이벤트 루프를 막지 않고, 시간·동시 실행 수를 제한한다 */
export const HEIC_DECODE_TIMEOUT_MS = 20_000;
const HEIC_MAX_CONCURRENCY = 2;

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

/** ISO-BMFF ftyp 의 major brand 가 HEVC 계열 HEIF 인지 (AVIF 는 sharp 가 직접 디코딩) */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
export function hasHeicBrand(input: Buffer): boolean {
  if (input.byteLength < 12 || input.toString('latin1', 4, 8) !== 'ftyp') return false;
  return HEIC_BRANDS.has(input.toString('latin1', 8, 12));
}

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

// 워커 안에서 실행되는 코드 — heic-decode(libheif WASM)는 irot/imir 변환을 적용한 픽셀을 돌려준다
const HEIC_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
console.log = () => {}; // libheif 의 진단 출력이 서버 로그(pino)에 섞이지 않게
const decode = require(workerData.modulePath);
(async () => {
  const images = await decode.all({ buffer: workerData.input });
  try {
    const first = images[0];
    if (first.width * first.height > workerData.maxPixels) throw new Error('too many pixels');
    const { width, height, data } = await first.decode();
    parentPort.postMessage({ width, height, data }, [data.buffer]);
  } finally {
    images.dispose();
  }
})().catch((e) => parentPort.postMessage({ error: String((e && e.message) || e) }));
`;

let heicActive = 0;
const heicWaiters: (() => void)[] = [];
async function acquireHeicSlot(): Promise<void> {
  if (heicActive < HEIC_MAX_CONCURRENCY) {
    heicActive++;
    return;
  }
  await new Promise<void>((resolve) => heicWaiters.push(resolve));
}
function releaseHeicSlot(): void {
  // 대기자가 있으면 슬롯을 그대로 넘겨 동시 실행 수가 상한을 넘지 않게 한다
  const next = heicWaiters.shift();
  if (next) next();
  else heicActive--;
}

type HeicWorkerMessage = { error: string } | { width: number; height: number; data: Uint8ClampedArray };

/** HEIC(HEVC) → RGBA. 픽셀 수는 전체 디코딩 전에 컨테이너 크기(ispe)로 먼저 확인한다 */
export async function decodeHeic(
  input: Buffer,
  opts: { maxPixels?: number; timeoutMs?: number } = {},
): Promise<RawImage> {
  await acquireHeicSlot();
  try {
    return await new Promise<RawImage>((resolve, reject) => {
      const worker = new Worker(HEIC_WORKER_SOURCE, {
        eval: true,
        workerData: {
          input,
          maxPixels: opts.maxPixels ?? MAX_PIXELS,
          modulePath: require.resolve('heic-decode'),
        },
      });
      const finish = (fn: () => void) => {
        clearTimeout(timer);
        worker.removeAllListeners();
        void worker.terminate();
        fn();
      };
      const timer = setTimeout(
        () => finish(() => reject(new InvalidImageError('decode timeout'))),
        opts.timeoutMs ?? HEIC_DECODE_TIMEOUT_MS,
      );
      worker.once('message', (msg: HeicWorkerMessage) => {
        if ('error' in msg) return finish(() => reject(new InvalidImageError('decode failed')));
        const data = Buffer.from(msg.data.buffer, msg.data.byteOffset, msg.data.byteLength);
        finish(() => resolve({ data, width: msg.width, height: msg.height }));
      });
      worker.once('error', () => finish(() => reject(new InvalidImageError('decode failed'))));
      worker.once('exit', () => finish(() => reject(new InvalidImageError('decode failed'))));
    });
  } finally {
    releaseHeicSlot();
  }
}

/** 원본을 디코딩해 EXIF 방향을 적용한 raw 픽셀로 만든다. 이후 파생본은 이 raw 에서 바로 만든다 */
async function normalize(input: Buffer): Promise<{ raw: RawImage & { channels: 3 | 4 }; format: string }> {
  let meta: Metadata | undefined;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch {
    meta = undefined;
  }

  // 사전 빌드된 sharp(libvips)는 HEVC 를 디코딩하지 못한다 → iPhone HEIC 는 WASM 디코더로 우회
  const isHevc = meta ? meta.format === 'heif' && meta.compression === 'hevc' : hasHeicBrand(input);
  if (isHevc) {
    if (meta?.width && meta.height && meta.width * meta.height > MAX_PIXELS) {
      throw new InvalidImageError('too many pixels');
    }
    const decoded = await decodeHeic(input);
    // HEIC 디코더 출력은 항상 RGBA — 완전 불투명이면 알파 채널을 버린다 (WebP/AVIF 용량 절약)
    let pipeline: Sharp = sharp(decoded.data, {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
      limitInputPixels: MAX_PIXELS,
    });
    if ((await pipeline.stats()).isOpaque) pipeline = pipeline.removeAlpha();
    const out = await pipeline.raw().toBuffer({ resolveWithObject: true });
    return { raw: toRaw(out.data, out.info), format: 'heif' };
  }

  if (!meta) throw new InvalidImageError('decode failed');
  if (!meta.format || !(ALLOWED_FORMATS as readonly string[]).includes(meta.format)) {
    throw new InvalidImageError(`format ${meta.format}`);
  }
  try {
    // 애니메이션 GIF·다중 페이지 TIFF 는 첫 장만 쓴다. rotate() 는 EXIF 방향을 적용한다
    const out = await sharp(input, { limitInputPixels: MAX_PIXELS, page: 0, pages: 1 })
      .rotate()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { raw: toRaw(out.data, out.info), format: meta.format };
  } catch {
    throw new InvalidImageError('decode failed');
  }
}

function toRaw(data: Buffer, info: OutputInfo): RawImage & { channels: 3 | 4 } {
  // sRGB 로 맞춘 뒤라 RGB/RGBA 만 나온다. 그 밖의 채널 구성(다중 밴드 TIFF 등)은 거부
  if (info.channels !== 3 && info.channels !== 4) throw new InvalidImageError('decode failed');
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * 이미지 검증 + EXIF 방향 적용 + 메타데이터 제거 + 파생본(WebP/AVIF 400/800/1600) 생성.
 * sharp 는 withMetadata() 를 호출하지 않으면 EXIF/GPS 를 출력에 포함하지 않는다.
 * 재인코딩된 결과만 공개하므로 폴리글랏 파일에 숨긴 스크립트도 제거된다.
 */
export async function processImage(input: Buffer, opts: { avif?: boolean } = {}): Promise<ProcessedImage> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new InvalidImageError('too large');
  const { raw, format } = await normalize(input);
  const { width, height, channels } = raw;

  // 파생본은 가장 큰 폭으로 한 번만 줄인 픽셀에서 만든다 (원본 크기 raw 에서 매번 줄이지 않게)
  let base: { data: Buffer; info: OutputInfo };
  try {
    base = await sharp(raw.data, { raw: { width, height, channels }, limitInputPixels: MAX_PIXELS })
      .resize({ width: MAX_VARIANT_WIDTH, withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError('decode failed');
  }
  const fromBase = () =>
    sharp(base.data, {
      raw: { width: base.info.width, height: base.info.height, channels: base.info.channels },
    });

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
    originalFormat: format,
    variants,
  };
}
