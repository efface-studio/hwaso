'use client';

import { ApiError } from '@shop/api-client';
import { IMAGE_UPLOAD, type ImageDto, type ReviewDto } from '@shop/shared';
import { useMutation } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MediaImage } from '@/components/product/media-image';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { StarInput } from './stars';

const LABELS = ['', '별로예요', '아쉬워요', '보통이에요', '좋아요', '최고예요'];

/** 후기 작성·수정: 별점, 내용(5자 이상), 사진 최대 5장 */
export function ReviewDialog({
  open,
  onOpenChange,
  orderId,
  counterpart,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  counterpart: string;
  initial?: ReviewDto | null;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [images, setImages] = useState<ImageDto[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { rating, comment: comment.trim(), imageKeys: images.map((i) => i.key) };
      return initial
        ? api.community.updateReview(initial.id, body)
        : api.community.createReview(orderId, body);
    },
    onSuccess: () => {
      toast.success(initial ? '후기를 수정했어요' : '후기를 남겼어요');
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '저장하지 못했습니다.'),
  });
  const upload = async (files: File[]) => {
    setUploading(true);
    try {
      for (const f of files.slice(0, 5 - images.length)) {
        const img = await api.market.uploadImage(f, f.name);
        setImages((prev) => [...prev, img]);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '사진을 올리지 못했습니다.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? '후기 수정' : `${counterpart}님과의 거래는 어땠나요?`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            loading={save.isPending}
            disabled={comment.trim().length < 5 || uploading}
            onClick={() => save.mutate()}
          >
            {initial ? '수정' : '후기 남기기'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1">
          <StarInput value={rating} onChange={setRating} />
          <p className="text-small text-muted">{LABELS[rating]}</p>
        </div>
        <Field
          label="후기"
          required
          hint="작품 상태·포장·응대 등 다른 분께 도움이 될 내용을 적어주세요 (5자 이상)."
        >
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.key} className="relative size-20 bg-background-soft">
              <MediaImage image={img} alt="첨부 사진" sizes="80px" fit="cover" />
              <button
                type="button"
                aria-label="사진 삭제"
                onClick={() => setImages((prev) => prev.filter((i) => i.key !== img.key))}
                className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-full bg-background/90"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {images.length < 5 && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => file.current?.click()}
              className="flex size-20 flex-col items-center justify-center gap-1 border border-dashed border-border-strong text-caption text-muted"
            >
              <ImagePlus className="size-5" aria-hidden />
              {uploading ? '올리는 중' : `${images.length}/5`}
            </button>
          )}
          <input
            ref={file}
            type="file"
            multiple
            accept={IMAGE_UPLOAD.accept}
            className="hidden"
            onChange={(e) => {
              void upload([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}
