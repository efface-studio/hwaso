'use client';

import { ApiError, type UploadedImage } from '@shop/api-client';
import { IMAGE_UPLOAD, MAX_PRODUCT_IMAGES } from '@shop/shared';
import { ArrowLeft, ArrowRight, ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MediaImage } from '@/components/product/media-image';
import { Progress } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import { uploadImages } from '@/lib/upload';
import { toast } from '@/stores/toast';

export type DraftImage = UploadedImage;

/**
 * 작품 사진 업로드: 여러 장 동시 선택, 진행률, 순서 변경(첫 장이 대표), 삭제.
 * 파일 형식·크기는 서버가 실제 디코딩으로 다시 검증한다.
 */
export function ImageUploader({
  images,
  onChange,
}: {
  images: DraftImage[];
  onChange: (next: DraftImage[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const left = MAX_PRODUCT_IMAGES - images.length;

  const upload = async (files: File[]) => {
    const picked = files.slice(0, left);
    if (files.length > left) toast.show(`사진은 최대 ${MAX_PRODUCT_IMAGES}장까지 올릴 수 있어요`);
    // 큰 사진은 올리기 전에 줄이고, 줄여도 용량 상한을 넘는 파일은 lib/upload 가 걸러 오류로 돌려준다
    if (!picked.length) return;
    let done = 0;
    setUploading({ done, total: picked.length });
    // 고른 순서를 지키며 3장씩 동시에 줄이고 올린다
    const results = await uploadImages(picked, {
      onEach: () => setUploading({ done: ++done, total: picked.length }),
    });
    const uploaded: DraftImage[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') uploaded.push(r.value);
      else
        toast.error(
          `${picked[i]!.name}: ${r.reason instanceof ApiError ? r.reason.message : '업로드에 실패했어요'}`,
        );
    });
    setUploading(null);
    onChange([...images, ...uploaded]);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-5" aria-label="등록한 사진">
        {images.map((img, i) => (
          <li key={img.key} className="relative aspect-square bg-background-soft">
            <MediaImage image={img} alt={`${i + 1}번째 사진`} sizes="160px" className="p-1.5" />
            {i === 0 && (
              <span className="absolute top-1 left-1 rounded-sm bg-secondary px-1.5 text-caption text-secondary-foreground">
                대표
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(images.filter((x) => x.key !== img.key))}
              aria-label={`${i + 1}번째 사진 삭제`}
              className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full bg-background/90"
            >
              <X className="size-4" aria-hidden />
            </button>
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="앞으로"
                className="inline-flex size-7 items-center justify-center rounded-full bg-background/90 disabled:opacity-0"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={i === images.length - 1}
                onClick={() => move(i, 1)}
                aria-label="뒤로"
                className="inline-flex size-7 items-center justify-center rounded-full bg-background/90 disabled:opacity-0"
              >
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
        {left > 0 && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void upload([...e.dataTransfer.files]);
              }}
              disabled={!!uploading}
              className={cn(
                'flex aspect-square w-full flex-col items-center justify-center gap-1 border border-dashed text-small text-muted transition-colors',
                dragOver ? 'border-primary bg-primary-soft' : 'border-border-strong hover:border-foreground',
              )}
            >
              <ImagePlus className="size-6" aria-hidden />
              사진 추가
              <span className="tabular text-caption">
                {images.length}/{MAX_PRODUCT_IMAGES}
              </span>
            </button>
          </li>
        )}
      </ul>
      {uploading && (
        <Progress
          value={(uploading.done / uploading.total) * 100}
          label={`사진 업로드 ${uploading.done}/${uploading.total}`}
        />
      )}
      <p className="text-caption text-muted">
        첫 번째 사진이 대표 이미지가 돼요. 자연광에서 정면·뒷면·서명·손상 부위를 찍으면 신뢰도가 높아집니다.
        위치 정보(EXIF)는 자동으로 지워져요.
      </p>
      <input
        ref={input}
        type="file"
        accept={IMAGE_UPLOAD.accept}
        multiple
        className="hidden"
        onChange={(e) => {
          void upload([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
