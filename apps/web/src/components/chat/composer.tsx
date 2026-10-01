'use client';

import { ApiError } from '@shop/api-client';
import { CHAT_IMAGES_MAX, CHAT_MESSAGE_MAX, IMAGE_UPLOAD, type SendMessageInput } from '@shop/shared';
import {
  CalendarClock,
  CornerDownRight,
  ImagePlus,
  MessageSquareText,
  Package,
  Plus,
  Send,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { controlClass, Field, Input } from '@/components/ui/field';
import { DropdownMenu } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';
import { PhrasesDialog } from './phrases-dialog';

const localNow = (offsetMs: number) => {
  const d = new Date(Date.now() + offsetMs);
  d.setMinutes(0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/** 날짜 선택기(react-day-picker)는 약속 대화상자를 열 때만 불러온다. 그동안 같은 크기 자리만 잡아 둔다 */
const DateTimeInput = dynamic(() => import('@/components/ui/date-picker').then((m) => m.DateTimeInput), {
  ssr: false,
  loading: () => <div className={`${controlClass} h-11`} aria-hidden />,
});

function AppointmentDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (a: { at: string; place: string }) => void;
}) {
  const [at, setAt] = useState(() => localNow(86_400_000));
  const [place, setPlace] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="거래 약속 잡기"
      description="직접 만나 거래할 때는 사람이 많은 곳에서, 결제는 화소 안에서 해주세요."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={!at || !place.trim()}
            onClick={() => onSubmit({ at: new Date(at).toISOString(), place: place.trim() })}
          >
            약속 보내기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="날짜와 시간" required>
          {(p) => <DateTimeInput {...p} value={at} min={localNow(0)} onChange={(v) => setAt(v)} />}
        </Field>
        <Field label="장소" required>
          {(p) => (
            <Input
              {...p}
              maxLength={100}
              placeholder="예) 인사동 쌈지길 정문"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** 입력창: Enter 전송(한글 조합 중 제외), Shift+Enter 줄바꿈, 사진·작품·약속 첨부 */
export function Composer({
  productId,
  onSend,
  onTyping,
  replying,
  onCancelReply,
}: {
  productId: string | null;
  onSend: (input: Omit<SendMessageInput, 'clientId'>) => void;
  onTyping: () => void;
  /** 답장 중인 원문 (보내거나 취소하면 null) */
  replying: { author: string; preview: string } | null;
  onCancelReply: () => void;
}) {
  const [text, setText] = useState('');
  const [appointment, setAppointment] = useState(false);
  const [phrases, setPhrases] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (replying) area.current?.focus();
  }, [replying]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSend({ kind: 'TEXT', body });
    setText('');
    area.current?.focus();
  };

  /** 여러 장을 올려 한 메시지로 보낸다 (최대 CHAT_IMAGES_MAX) */
  const upload = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    if (files.length > CHAT_IMAGES_MAX) toast.show(`사진은 한 번에 ${CHAT_IMAGES_MAX}장까지 보낼 수 있어요.`);
    setUploading(true);
    try {
      const imgs = await Promise.all(
        files.slice(0, CHAT_IMAGES_MAX).map((f) => api.market.uploadImage(f, f.name)),
      );
      onSend({ kind: 'IMAGE', imageKeys: imgs.map((i) => i.key) });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : '사진을 올리지 못했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-t border-border bg-background">
      {replying && (
        <div className="flex animate-overlay-in items-center gap-2 border-b border-border px-4 py-2 text-caption">
          <CornerDownRight className="size-4 shrink-0 text-muted" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">{replying.author}에게 답장</span>
            <span className="block truncate text-muted">{replying.preview}</span>
          </p>
          <button
            type="button"
            aria-label="답장 취소"
            onClick={onCancelReply}
            className="rounded-full p-1.5 text-muted hover:bg-surface-2"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        <DropdownMenu
          align="start"
          trigger={
            <button
              type="button"
              aria-label="첨부"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <Plus className="size-5" aria-hidden />
            </button>
          }
          items={[
            {
              label: '사진',
              icon: <ImagePlus className="size-4" aria-hidden />,
              onSelect: () => file.current?.click(),
            },
            ...(productId
              ? [
                  {
                    label: '이 작품 보내기',
                    icon: <Package className="size-4" aria-hidden />,
                    onSelect: () => onSend({ kind: 'PRODUCT', productId }),
                  },
                ]
              : []),
            {
              label: '자주 쓰는 문구',
              icon: <MessageSquareText className="size-4" aria-hidden />,
              onSelect: () => setPhrases(true),
            },
            {
              label: '거래 약속',
              icon: <CalendarClock className="size-4" aria-hidden />,
              onSelect: () => setAppointment(true),
            },
          ]}
        />
        <textarea
          ref={area}
          aria-label="메시지 입력"
          rows={1}
          maxLength={CHAT_MESSAGE_MAX}
          value={text}
          placeholder={uploading ? '사진을 올리는 중…' : '메시지를 입력하세요'}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            e.target.style.overflowY = e.target.scrollHeight > 128 ? 'auto' : 'hidden';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-32 min-h-10 flex-1 resize-none overflow-hidden rounded-md border border-border-strong bg-background px-3 py-2 text-body outline-none focus:border-foreground"
        />
        <Button
          aria-label="보내기"
          className="size-10 shrink-0 rounded-full px-0"
          disabled={!text.trim()}
          onClick={submit}
        >
          <Send className="size-4" aria-hidden />
        </Button>
        <input
          ref={file}
          type="file"
          accept={IMAGE_UPLOAD.accept}
          multiple
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = '';
          }}
        />
        {phrases && (
          <PhrasesDialog
            open
            onOpenChange={setPhrases}
            onPick={(p) => {
              setText((t) => (t.trim() ? `${t.trimEnd()} ${p}` : p));
              setPhrases(false);
              requestAnimationFrame(() => area.current?.focus());
            }}
          />
        )}
        {appointment && (
          <AppointmentDialog
            open
            onOpenChange={setAppointment}
            onSubmit={(a) => {
              onSend({ kind: 'APPOINTMENT', appointment: a });
              setAppointment(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
