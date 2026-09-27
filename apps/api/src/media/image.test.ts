import sharp from 'sharp';
import { InvalidImageError, processImage } from './image';

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

  it('작은 이미지는 확대하지 않는다', async () => {
    const input = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    const out = await processImage(input, { avif: false });
    for (const v of out.variants) expect((await sharp(v.body).metadata()).width).toBe(300);
  });

  it('허용되지 않은 포맷(GIF)은 거부한다', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    await expect(processImage(gif)).rejects.toBeInstanceOf(InvalidImageError);
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
