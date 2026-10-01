import { ApiError, type UploadedImage } from '@shop/api-client';
import { IMAGE_UPLOAD } from '@shop/shared';
import { api } from './api';

/** 업로드 전 긴 변 상한 — 앱(apps/mobile/src/lib/upload.ts)과 같다. 서버 파생본 최대 폭(1600)보다 넉넉하다 */
export const UPLOAD_MAX_EDGE = 2400;
/** 동시에 올리는 장 수 (앱과 같다) */
export const UPLOAD_CONCURRENCY = 3;

/** 캔버스로 다시 그릴 수 있는 형식만 줄인다. GIF(움직임)·HEIC(대부분 브라우저가 못 읽음)는 서버가 처리한다 */
const RESIZABLE = /^image\/(jpeg|png|webp)$/;

/** <img> 로 디코딩한다 — EXIF 회전이 적용된 크기·방향으로 그려진다 (createImageBitmap 은 브라우저마다 다르다) */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/**
 * 긴 변이 UPLOAD_MAX_EDGE 보다 크면 줄여 다시 저장한다 (원본 3~10MB → 보통 1MB 안팎).
 * JPEG 는 JPEG(0.85, 앱과 같음), PNG·WebP 는 투명도를 지키려 WebP(0.9).
 * 이미 작거나, 줄인 결과가 더 크거나, 실패하면 원본을 그대로 올린다. 서버가 EXIF 제거·파생본 생성을 한다.
 */
export async function shrinkForUpload(file: File): Promise<File> {
  if (!RESIZABLE.test(file.type) || typeof document === 'undefined') return file;
  try {
    const img = await loadImage(file);
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (!long || long <= UPLOAD_MAX_EDGE) return file;
    const scale = UPLOAD_MAX_EDGE / long;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = file.type === 'image/jpeg';
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, jpeg ? 'image/jpeg' : 'image/webp', jpeg ? 0.85 : 0.9),
    );
    if (!blob || blob.size >= file.size) return file;
    // WebP 인코딩을 못 하는 브라우저는 PNG 로 돌려준다 — 실제 형식에 맞춰 확장자를 붙인다
    const ext = blob.type.split('/')[1] ?? 'jpg';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

/** 줄인 뒤 서버에 올린다. 줄여도 용량 상한을 넘으면 보내지 않는다 (서버도 다시 검사한다) */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const f = await shrinkForUpload(file);
  if (f.size > IMAGE_UPLOAD.maxBytes)
    throw new ApiError(413, 'IMAGE_TOO_LARGE', `${IMAGE_UPLOAD.maxMb}MB 이하 사진만 올릴 수 있어요`);
  return api.market.uploadImage(f, f.name);
}

/**
 * 여러 장을 동시에 limit 장씩 줄이고 올린다. 결과는 고른 순서대로, 한 장 끝날 때마다 onEach.
 */
export async function uploadImages(
  files: File[],
  { limit = UPLOAD_CONCURRENCY, onEach }: { limit?: number; onEach?: () => void } = {},
): Promise<PromiseSettledResult<UploadedImage>[]> {
  const out = new Array<PromiseSettledResult<UploadedImage>>(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await uploadImage(files[i]!) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
      onEach?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, worker));
  return out;
}
