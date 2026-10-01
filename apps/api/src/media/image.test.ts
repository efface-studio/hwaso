import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  decodeHeic,
  hasHeicBrand,
  InvalidImageError,
  MAX_UPLOAD_BYTES,
  prepareImage,
  processImage,
  settleAll,
} from './image';

// macOS sips 로 만든 HEVC HEIC — 64x32(왼쪽 빨강·오른쪽 파랑) 원본에 방향 6(90도 회전) 이 irot 로 들어 있다
const orientedHeic = readFileSync(new URL('../../test/fixtures/oriented.heic', import.meta.url));

const solid = (fmt: 'gif' | 'tiff' | 'avif' | 'png') =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: '#336699' } })
    .toFormat(fmt)
    .toBuffer();

describe('processImage', () => {
  it('EXIF 방향을 적용하고 메타데이터를 제거한다', async () => {
    // orientation 6 = 90도 회전 필요 → 400x200 원본은 200x400 으로 보여야 한다
    const input = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ffffff' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await processImage(input, { avif: false });
    expect([out.width, out.height]).toEqual([200, 400]);
    const variantMeta = await sharp(out.variants[0]!.body).metadata();
    expect(variantMeta.exif).toBeUndefined();
    expect(variantMeta.orientation).toBeUndefined();
  });

  it('WebP/AVIF 를 폭 400/800/1600 으로 만든다', async () => {
    const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#7a5c2f' } })
      .jpeg()
      .toBuffer();
    const out = await processImage(input);
    const got = await Promise.all(
      out.variants.map(async (v) => {
        const m = await sharp(v.body).metadata();
        return `${v.path.slice(out.key.length)} ${v.contentType} ${m.format}/${m.compression ?? '-'} ${m.width}`;
      }),
    );
    expect(got.sort()).toEqual([
      '/w1600.avif image/avif heif/av1 1600',
      '/w1600.webp image/webp webp/- 1600',
      '/w400.avif image/avif heif/av1 400',
      '/w400.webp image/webp webp/- 400',
      '/w800.avif image/avif heif/av1 800',
      '/w800.webp image/webp webp/- 800',
    ]);
  });

  it('보관본은 긴 변 3200 AVIF 로 줄이고 메타데이터를 지운다 (세로로 긴 이미지도 파생본 폭은 유지)', async () => {
    // 방향 6 → 8000x2000 원본은 2000x8000 으로 보인다
    const input = await sharp({ create: { width: 8000, height: 2000, channels: 3, background: '#204060' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await processImage(input, { avif: false });
    expect(out.master.path).toBe(`${out.key}.avif`);
    expect(out.master.contentType).toBe('image/avif');
    const m = await sharp(out.master.body).metadata();
    expect([m.format, m.compression, m.width, m.height]).toEqual(['heif', 'av1', 800, 3200]);
    expect(m.exif).toBeUndefined();
    const w1600 = out.variants.find((v) => v.path.endsWith('/w1600.webp'))!;
    expect((await sharp(w1600.body).metadata()).width).toBe(1600);
  });

  it('보관본은 확대하지 않고 투명도를 유지한다', async () => {
    const input = await sharp({
      create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    const m = await sharp((await processImage(input, { avif: false })).master.body).metadata();
    expect([m.width, m.height, m.hasAlpha]).toEqual([300, 200, true]);
  });

  it('작은 이미지는 확대하지 않는다', async () => {
    const input = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    const out = await processImage(input, { avif: false });
    for (const v of out.variants) expect((await sharp(v.body).metadata()).width).toBe(300);
  });

  it.each(['gif', 'tiff', 'avif', 'png'] as const)('%s 를 받아 WebP 파생본을 만든다', async (fmt) => {
    const out = await processImage(await solid(fmt), { avif: false });
    expect([out.width, out.height]).toEqual([40, 20]);
    expect((await sharp(out.variants[0]!.body).metadata()).format).toBe('webp');
  });

  it('애니메이션 GIF 는 첫 프레임만 쓴다', async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 20, height: 20, channels: 3, background } })
        .raw()
        .toBuffer();
    const [red, blue] = await Promise.all([frame('#ff0000'), frame('#0000ff')]);
    // 세로로 쌓은 두 장을 pageHeight 로 나눠 2프레임 GIF 로 만든다
    const animated = await sharp(Buffer.concat([red, blue]), {
      raw: { width: 20, height: 40, channels: 3, pageHeight: 20 },
    })
      .gif()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    const out = await processImage(animated, { avif: false });
    expect([out.width, out.height]).toEqual([20, 20]);
    expect(out.dominantColor.startsWith('#f')).toBe(true);
  });

  it('HEIC(HEVC) 는 WASM 디코더로 풀고 irot 방향을 한 번만 적용한다', async () => {
    expect(hasHeicBrand(orientedHeic)).toBe(true);
    const out = await processImage(orientedHeic, { avif: false });
    // 64x32 → 90도 회전 = 32x64. 두 번 회전되면 다시 64x32 가 된다
    expect([out.width, out.height]).toEqual([32, 64]);
    const { data, info } = await sharp(out.variants[0]!.body).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3); // 불투명 RGBA → 알파 제거
    const px = (y: number) => Array.from(data.subarray(y * info.width * 3, y * info.width * 3 + 3));
    // 왼쪽(빨강)이 위로, 오른쪽(파랑)이 아래로 간다
    expect(px(0)[0]).toBeGreaterThan(200);
    expect(px(info.height - 1)[2]).toBeGreaterThan(200);
    expect(out.originalFormat).toBe('heif');
  });

  it('HEIC 디코딩이 시간 제한을 넘으면 워커를 멈추고 거부한다', async () => {
    await expect(decodeHeic(orientedHeic, { timeoutMs: 1 })).rejects.toThrow('decode timeout');
  });

  it('HEIC 는 전체 디코딩 전에 픽셀 수 상한을 확인한다', async () => {
    await expect(decodeHeic(orientedHeic, { maxPixels: 100 })).rejects.toBeInstanceOf(InvalidImageError);
  });

  it('HEIC 브랜드만 흉내 낸 깨진 파일은 거부한다', async () => {
    const fake = Buffer.concat([orientedHeic.subarray(0, 40), Buffer.alloc(200)]);
    await expect(processImage(fake)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it('SVG 는 거부한다', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(processImage(svg)).rejects.toThrow('format svg');
  });

  it('용량 상한을 넘으면 디코딩 전에 거부한다', async () => {
    await expect(processImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow('too large');
  });

  it('키는 사용자 파일명과 무관한 추측 불가 값', async () => {
    const input = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    const [a, b] = await Promise.all([
      processImage(input, { avif: false }),
      processImage(input, { avif: false }),
    ]);
    expect(a.key).toMatch(/^img\/\d{4}\/\d{2}\/[\w-]{16}$/);
    expect(a.key).not.toBe(b.key);
  });
});

describe('prepareImage · settleAll', () => {
  it('큰 폭부터 인코딩을 시작하고, 파일마다 따로 기다릴 수 있다', async () => {
    const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#556677' } })
      .jpeg()
      .toBuffer();
    const img = await prepareImage(input);
    expect([img.width, img.height, img.originalFormat]).toEqual([2000, 1000, 'jpeg']);
    const files = await Promise.all(img.variants);
    expect(files.map((f) => f.path.slice(img.key.length))).toEqual([
      '/w1600.webp',
      '/w1600.avif',
      '/w800.webp',
      '/w800.avif',
      '/w400.webp',
      '/w400.avif',
    ]);
    expect((await img.master).path).toBe(`${img.key}.avif`);
    expect(await img.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('settleAll 은 모두 끝날 때까지 기다린 뒤 첫 실패를 던진다', async () => {
    let slowDone = false;
    const slow = new Promise<number>((r) =>
      setTimeout(() => {
        slowDone = true;
        r(2);
      }, 30),
    );
    await expect(settleAll([Promise.reject(new Error('boom')), slow])).rejects.toThrow('boom');
    expect(slowDone).toBe(true);
    await expect(settleAll([Promise.resolve(1), slow])).resolves.toEqual([1, 2]);
  });
});
