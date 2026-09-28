'use client';

import { ApiError } from '@shop/api-client';
import { CHAT_PHRASE_MAX, CHAT_PHRASES_MAX } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/field';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

const PHRASES_KEY = ['chat', 'phrases'];

/** 자주 쓰는 문구: 누르면 입력창에 넣고, 편집에서 추가·삭제 (웹·앱 공용 저장) */
export function PhrasesDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (text: string) => void;
}) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: PHRASES_KEY, queryFn: () => api.chat.phrases(), enabled: open });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [added, setAdded] = useState('');
  const save = useMutation({
    mutationFn: (phrases: string[]) => api.chat.savePhrases(phrases),
    onSuccess: (res) => {
      qc.setQueryData(PHRASES_KEY, res);
      setDraft(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : '문구를 저장하지 못했습니다.'),
  });
  const phrases = list.data?.phrases ?? [];

  const add = () => {
    const v = added.trim();
    if (!v || !draft) return;
    setDraft([...draft, v]);
    setAdded('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setDraft(null);
        onOpenChange(v);
      }}
      title="자주 쓰는 문구"
      description={draft ? `최대 ${CHAT_PHRASES_MAX}개까지 저장할 수 있어요.` : '누르면 입력창에 넣어드려요.'}
      footer={
        draft ? (
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate(draft)}>
              저장
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setDraft(phrases)}>
            편집
          </Button>
        )
      }
    >
      {list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : draft ? (
        <div className="flex flex-col gap-2">
          {draft.map((p, i) => (
            <div key={`${i}-${p}`} className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-body">{p}</p>
              <button
                type="button"
                aria-label={`"${p}" 삭제`}
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                className="rounded-sm p-2 text-muted hover:bg-surface-2 hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {draft.length < CHAT_PHRASES_MAX && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <Input
                aria-label="새 문구"
                maxLength={CHAT_PHRASE_MAX}
                placeholder="새 문구 입력"
                value={added}
                onChange={(e) => setAdded(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={!added.trim()}>
                추가
              </Button>
            </form>
          )}
        </div>
      ) : phrases.length ? (
        <ul className="flex flex-col gap-1">
          {phrases.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="w-full rounded-md px-3 py-2.5 text-left text-body hover:bg-surface-2"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-small text-muted">저장한 문구가 없어요. 편집에서 추가해보세요.</p>
      )}
    </Dialog>
  );
}
