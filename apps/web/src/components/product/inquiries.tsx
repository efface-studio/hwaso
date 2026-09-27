'use client';

import { ApiError } from '@shop/api-client';
import { formatRelativeTime } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/choice';
import { Textarea } from '@/components/ui/field';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';

/** 상품 문의: 작성 ↔ 삭제, 판매자 답변 ↔ 답변 수정 */
export function Inquiries({ productId, isMine }: { productId: string; isMine: boolean }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const key = ['inquiries', productId, user?.id ?? 'anon'];
  const { data, isPending } = useQuery({ queryKey: key, queryFn: () => api.market.inquiries(productId) });
  const [question, setQuestion] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');

  const onError = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다.');
  const refresh = () => qc.invalidateQueries({ queryKey: ['inquiries', productId] });

  const ask = useMutation({
    mutationFn: () => api.market.ask(productId, { question: question.trim(), isPrivate }),
    onSuccess: () => {
      setQuestion('');
      setPrivate(false);
      toast.success('문의를 등록했어요. 판매자가 답변하면 알려드릴게요.');
      void refresh();
    },
    onError,
  });
  const remove = useMutation({ mutationFn: api.market.deleteInquiry, onSuccess: refresh, onError });
  const reply = useMutation({
    mutationFn: (id: string) => api.market.answerInquiry(id, answer.trim()),
    onSuccess: () => {
      setAnswering(null);
      setAnswer('');
      void refresh();
    },
    onError,
  });

  return (
    <section aria-labelledby="qna" className="border-t border-border py-8">
      <h2 id="qna" className="mb-4 text-h3">
        상품 문의 {data && data.length > 0 && <span className="text-muted">{data.length}</span>}
      </h2>

      {!isMine && (
        <form
          className="mb-6 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!user) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
            if (question.trim().length < 2) return toast.error('문의 내용을 2자 이상 입력해주세요.');
            ask.mutate();
          }}
        >
          <label htmlFor="inquiry" className="sr-only">
            문의 내용
          </label>
          <Textarea
            id="inquiry"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={1000}
            placeholder={
              user ? '작품 상태, 배송, 추가 사진 등 궁금한 점을 남겨주세요.' : '로그인 후 문의할 수 있어요.'
            }
            className="min-h-20"
          />
          <div className="flex items-center justify-between">
            <Checkbox checked={isPrivate} onCheckedChange={setPrivate} label="비밀 문의" />
            <Button type="submit" variant="secondary" loading={ask.isPending}>
              문의하기
            </Button>
          </div>
        </form>
      )}

      {isPending ? (
        <p className="text-small text-muted">불러오는 중…</p>
      ) : !data?.length ? (
        <p className="text-small text-muted">아직 문의가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {data.map((q) => (
            <li key={q.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-start gap-1.5 text-body">
                  {q.isPrivate && (
                    <Lock className="mt-1 size-3.5 shrink-0 text-muted" aria-label="비밀 문의" />
                  )}
                  <span className={q.hidden ? 'text-muted' : ''}>{q.question}</span>
                </p>
                {q.isMine && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(q.id)}
                    className="shrink-0 text-caption text-muted hover:text-destructive"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="mt-1 text-caption text-muted">
                {q.authorNickname} · {formatRelativeTime(q.createdAt)}
              </p>
              {q.answer && (
                <div className="mt-3 rounded-sm bg-background-soft p-3">
                  <p className="text-caption font-semibold text-primary">판매자 답변</p>
                  <p className="mt-1 text-body whitespace-pre-wrap">{q.answer}</p>
                </div>
              )}
              {isMine &&
                !q.hidden &&
                (answering === q.id ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <Textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      aria-label="답변"
                      className="min-h-20"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setAnswering(null)}>
                        취소
                      </Button>
                      <Button
                        size="sm"
                        loading={reply.isPending}
                        disabled={!answer.trim()}
                        onClick={() => reply.mutate(q.id)}
                      >
                        답변 등록
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAnswering(q.id);
                      setAnswer(q.answer ?? '');
                    }}
                    className="mt-2 text-small font-semibold text-primary"
                  >
                    {q.answer ? '답변 수정' : '답변하기'}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
