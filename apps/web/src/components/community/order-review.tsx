'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { ReviewDialog } from './review-dialog';
import { Stars } from './stars';

/** 주문 상세(구매 확정 후): 내 후기 작성 ↔ 수정 ↔ 삭제 */
export function OrderReview({ orderId, counterpart }: { orderId: string; counterpart: string }) {
  const qc = useQueryClient();
  const key = ['my-review', orderId];
  const { data: review, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api.community.myReview(orderId),
  });
  const [open, setOpen] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['order', orderId] });
  };
  if (isPending) return null;
  return (
    <section className="rounded-sm border border-border p-4">
      {review ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-label">내가 남긴 후기</p>
            <div className="flex gap-1">
              {review.editable && (
                <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                  수정
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  confirm('후기를 삭제할까요?') &&
                  void api.community
                    .deleteReview(review.id)
                    .then(() => {
                      toast.success('후기를 삭제했어요');
                      refresh();
                    })
                    .catch(() => toast.error('삭제하지 못했습니다.'))
                }
              >
                삭제
              </Button>
            </div>
          </div>
          <Stars value={review.rating} />
          <p className="text-body whitespace-pre-wrap">{review.comment}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-body-strong">거래는 어떠셨나요?</p>
            <p className="text-small text-muted">
              후기는 {counterpart}님의 프로필에 남아 다른 분들께 도움이 돼요.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>후기 쓰기</Button>
        </div>
      )}
      {open && (
        <ReviewDialog
          open
          onOpenChange={setOpen}
          orderId={orderId}
          counterpart={counterpart}
          initial={review}
          onSaved={refresh}
        />
      )}
    </section>
  );
}
