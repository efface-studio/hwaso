import { randomBytes } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { IMAGE_UPLOAD } from '@shop/shared';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

/**
 * docs/SECURITY.md — 확장자/Content-Type 을 믿지 않고 실제 디코딩 결과로 판단한다.
 * gif/tiff 는 첫 프레임(페이지)만 쓴다. svg 는 스크립트·외부 참조 위험으로 계속 거부한다.
 */
export const ALLOWED_FORMATS = ['jpeg', 'png', 'webp', 'heif', 'avif', 'gif', 'tiff'] as const;
export const MAX_UPLOAD_BYTES = IMAGE_UPLOAD.maxBytes;
export const MAX_PIXELS = 100_000_000;
export const VARIANT_WIDTHS = [400, 800, 1600] as const;
const MAX_VARIANT_WIDTH = Math.max(...VARIANT_WIDTHS);
/**
 * 파생본 인코딩 설정 — SSIM·용량·인코딩 시간을 비교해 고른 값 (docs/ARCHITECTURE.md §6).
 * AVIF effort 4 이상은 3% 줄이려고 5배 느려지고, WebP effort 6·smartSubsample 은 같은 SSIM 에서 이득이 없다
 */
const WEBP_OPTIONS = { quality: 82 } as const;
const AVIF_OPTIONS = { quality: 55, effort: 3 } as const;
/** 비공개 보관본: 업로드 원본 대신 긴 변 3200px AVIF 고화질 재인코딩 (EXIF/GPS 없음, 원본 대비 약 1/4) */
export const MASTER_MAX_EDGE = 3200;
// effort 0: SSIM 은 effort 2 와 같고(JPEG q90 4:4:4 수준) 용량 +2%, CPU 는 약 1/4
const MASTER_AVIF_OPTIONS = { quality: 80, effort: 0 } as const;
/** HEIC(HEVC) 은 WASM 디코더로 푼다 — 워커 스레드에서 실행해 이벤트 루프를 막지 않고, 시간·동시 실행 수를 제한한다 */
export const HEIC_DECODE_TIMEOUT_MS = 20_000;
const HEIC_MAX_CONCURRENCY = 2;

export class InvalidImageError extends Error {}

export interface ImageFile {
  path: string;
  body: Buffer;
  contentType: string;
}

export interface ProcessedImage {
  key: string;
  width: number;
  height: number;
  dominantColor: string;
  originalFormat: string;
  /** 비공개 보관본 (originals/<key>.avif) — 재처리용. 공개하지 않는다 */
  master: ImageFile;
  variants: ImageFile[];
}

/** 인코딩을 시작한 상태 — 파일마다 끝나는 대로 저장을 시작할 수 있다 (media.service.ts) */
export interface PreparedImage {
  key: string;
  width: number;
  height: number;
  originalFormat: string;
  dominantColor: Promise<string>;
  master: Promise<ImageFile>;
  variants: Promise<ImageFile>[];
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
    // 디코더 출력은 항상 RGBA — 완전 불투명이면 여기서 알파를 버린다 (메인 스레드·sharp 패스를 따로 쓰지 않게)
    let opaque = true;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break; }
    let out = data;
    if (opaque) {
      out = new Uint8Array(width * height * 3);
      for (let s = 0, d = 0; s < data.length; s += 4, d += 3) {
        out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2];
      }
    }
    parentPort.postMessage({ width, height, channels: opaque ? 3 : 4, data: out }, [out.buffer]);
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

type HeicWorkerMessage =
  | { error: string }
  | { width: number; height: number; channels: 3 | 4; data: Uint8Array | Uint8ClampedArray };

/** HEIC(HEVC) → RGB(불투명) 또는 RGBA. 픽셀 수는 전체 디코딩 전에 컨테이너 크기(ispe)로 먼저 확인한다 */
export async function decodeHeic(
  input: Buffer,
  opts: { maxPixels?: number; timeoutMs?: number } = {},
): Promise<RawImage & { channels: 3 | 4 }> {
  await acquireHeicSlot();
  try {
    return await new Promise((resolve, reject) => {
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
        finish(() => resolve({ data, width: msg.width, height: msg.height, channels: msg.channels }));
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
    // 불투명 여부 확인·알파 제거는 워커에서 끝낸다 (WebP/AVIF 용량 절약)
    return { raw: await decodeHeic(input), format: 'heif' };
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

/** 모두 끝날 때까지 기다린 뒤 첫 실패를 던진다 — 먼저 실패해도 나머지 작업이 처리되지 않은 채 남지 않게 */
export async function settleAll<T>(jobs: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(jobs);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map((r) => (r as PromiseFulfilledResult<T>).value);
}

/**
 * 이미지 검증 + EXIF 방향 적용 + 메타데이터 제거 후 파생본(WebP/AVIF 400/800/1600)·보관본 인코딩을 시작한다.
 * sharp 는 withMetadata() 를 호출하지 않으면 EXIF/GPS 를 출력에 포함하지 않는다.
 * 재인코딩된 결과만 공개하므로 폴리글랏 파일에 숨긴 스크립트도 제거된다.
 */
export async function prepareImage(input: Buffer, opts: { avif?: boolean } = {}): Promise<PreparedImage> {
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

  const key = newImageKey();
  // sharp 작업은 libuv 스레드 풀(기본 4개)에서 시작 순서대로 돈다 — 오래 걸리는 큰 폭부터 시작해
  // 마지막에 큰 인코딩 하나만 남는 꼬리를 줄인다 (단일 스레드인 WebP 1600 이 가장 길다)
  const variants: Promise<ImageFile>[] = [];
  const encode = (w: number, kind: 'webp' | 'avif') => {
    const resized = fromBase().resize({ width: w, withoutEnlargement: true });
    const job = kind === 'webp' ? resized.webp(WEBP_OPTIONS) : resized.avif(AVIF_OPTIONS);
    variants.push(
      job.toBuffer().then((body) => ({ path: `${key}/w${w}.${kind}`, body, contentType: `image/${kind}` })),
    );
  };
  const widths = [...VARIANT_WIDTHS].sort((a, b) => b - a);
  encode(widths[0]!, 'webp');
  if (opts.avif !== false) encode(widths[0]!, 'avif');
  // 보관본은 raw 에서 바로 만든다 — 파생본 기준(폭 1600)과 따로 줄여야 세로로 긴 이미지의 파생본 폭이 줄지 않는다
  const master = sharp(raw.data, { raw: { width, height, channels }, limitInputPixels: MAX_PIXELS })
    .resize({ width: MASTER_MAX_EDGE, height: MASTER_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .avif(MASTER_AVIF_OPTIONS)
    .toBuffer()
    .then((body) => ({ path: `${key}.avif`, body, contentType: 'image/avif' }));
  for (const w of widths.slice(1)) {
    encode(w, 'webp');
    if (opts.avif !== false) encode(w, 'avif');
  }

  // 대표색은 64px 썸네일로 계산한다 (stats() 는 입력 전체를 읽는다). 인코딩과 함께 돈다
  const dominantColor = fromBase()
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then((thumb) =>
      sharp(thumb.data, {
        raw: { width: thumb.info.width, height: thumb.info.height, channels: thumb.info.channels },
      }).stats(),
    )
    .then(({ dominant }) => `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`);

  return { key, width, height, originalFormat: format, dominantColor, master, variants };
}

/** prepareImage 의 결과를 모두 기다려 메모리에 모은다 (시드·테스트용) */
export async function processImage(input: Buffer, opts: { avif?: boolean } = {}): Promise<ProcessedImage> {
  const img = await prepareImage(input, opts);
  const [dominantColor, master, variants] = await Promise.all([
    img.dominantColor,
    img.master,
    settleAll(img.variants),
  ]);
  return {
    key: img.key,
    width: img.width,
    height: img.height,
    dominantColor,
    originalFormat: img.originalFormat,
    master,
    variants,
  };
}
