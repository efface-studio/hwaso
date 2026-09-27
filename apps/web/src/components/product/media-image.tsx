import type { ImageDto } from '@shop/shared';
import { cn } from '@/lib/cn';
import { mediaSrcSet, mediaUrl } from '@/lib/media';

interface MediaImageProps {
  image: ImageDto | null;
  alt: string;
  /** 레이아웃상 표시 폭 힌트 (srcset 선택용) */
  sizes?: string;
  className?: string;
  /** 작품은 잘리지 않게 contain 이 기본 (작품의 형태 보존) */
  fit?: 'contain' | 'cover';
  priority?: boolean;
}

/**
 * 서버가 만든 AVIF/WebP 파생본(400/800/1600)을 브라우저가 고르게 한다.
 * 로딩 전에는 대표색을 배경으로 깔아 레이아웃 흔들림과 빈 화면을 줄인다.
 */
export function MediaImage({
  image,
  alt,
  sizes = '(min-width: 1024px) 25vw, 50vw',
  className,
  fit = 'contain',
  priority,
}: MediaImageProps) {
  if (!image) {
    return (
      <div
        className={cn('size-full bg-background-soft', className)}
        aria-label={`${alt} (이미지 없음)`}
        role="img"
      />
    );
  }
  return (
    <picture className={cn('block size-full', className)}>
      <source type="image/avif" srcSet={mediaSrcSet(image.key, 'avif')} sizes={sizes} />
      <img
        src={mediaUrl(image.key, 800)}
        srcSet={mediaSrcSet(image.key)}
        sizes={sizes}
        alt={alt}
        width={image.width}
        height={image.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={cn('size-full', fit === 'contain' ? 'object-contain' : 'object-cover')}
        style={{ backgroundColor: 'var(--background-soft)' }}
      />
    </picture>
  );
}
