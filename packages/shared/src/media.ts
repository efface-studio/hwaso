const MAX_MB = 30;

/**
 * 사진 업로드 공통 규칙 (웹·앱·서버). 실제 포맷 판별은 서버가 디코딩으로 한다 (docs/SECURITY.md).
 * accept 는 image/* 에 .heic/.heif 를 더해 HEIC 를 image/* 로 분류하지 않는 브라우저에서도 고를 수 있게 한다.
 */
export const IMAGE_UPLOAD = {
  maxBytes: MAX_MB * 1024 * 1024,
  maxMb: MAX_MB,
  accept: 'image/*,.heic,.heif',
  hint: `JPG · PNG · HEIC · WebP · GIF 등, ${MAX_MB}MB 이하`,
} as const;
