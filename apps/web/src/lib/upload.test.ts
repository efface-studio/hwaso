import { IMAGE_UPLOAD } from '@shop/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadImage } = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock('./api', () => ({ api: { market: { uploadImage } } }));

import { shrinkForUpload, uploadImages } from './upload';

const file = (name: string, type = 'image/jpeg', size = 10) =>
  new File([new Uint8Array(size)], name, { type });

describe('uploadImages', () => {
  beforeEach(() => {
    uploadImage.mockReset();
  });

  it('keeps the picked order and runs at most 3 at once', async () => {
    let active = 0;
    let peak = 0;
    uploadImage.mockImplementation(async (f: File) => {
      active++;
      peak = Math.max(peak, active);
      // 뒤에 고른 사진이 먼저 끝나도 결과 순서는 고른 순서
      await new Promise((r) => setTimeout(r, 30 - Number(f.name[0]) * 5));
      active--;
      return { key: f.name, width: 1, height: 1, dominantColor: '#000' };
    });
    const onEach = vi.fn();
    const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'].map((n) => file(n));
    const out = await uploadImages(files, { onEach });
    expect(peak).toBe(3);
    expect(onEach).toHaveBeenCalledTimes(5);
    expect(out.map((r) => r.status === 'fulfilled' && r.value.key)).toEqual(files.map((f) => f.name));
  });

  it('reports a failed photo in its slot without stopping the rest', async () => {
    uploadImage.mockImplementation(async (f: File) => {
      if (f.name === 'bad.jpg') throw new Error('boom');
      return { key: f.name, width: 1, height: 1, dominantColor: '#000' };
    });
    const out = await uploadImages([file('a.jpg'), file('bad.jpg'), file('c.jpg')]);
    expect(out.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  it('does not send a file that is still over the size limit', async () => {
    const big = file('huge.gif', 'image/gif', IMAGE_UPLOAD.maxBytes + 1);
    const [r] = await uploadImages([big]);
    expect(r!.status).toBe('rejected');
    expect(uploadImage).not.toHaveBeenCalled();
  });
});

describe('shrinkForUpload', () => {
  it('leaves formats the canvas cannot redraw untouched', async () => {
    const gif = file('a.gif', 'image/gif');
    const heic = file('a.heic', 'image/heic');
    expect(await shrinkForUpload(gif)).toBe(gif);
    expect(await shrinkForUpload(heic)).toBe(heic);
  });

  it('falls back to the original when the image cannot be decoded', async () => {
    // jsdom 은 이미지를 디코딩하지 않는다 — 실패해도 원본을 올린다
    const jpg = file('a.jpg');
    expect(await shrinkForUpload(jpg)).toBe(jpg);
  });
});
