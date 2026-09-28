'use client';

import { formatPrice, type ChatMessageDto } from '@shop/shared';
import { CalendarClock, CornerDownRight, MapPin, MoreHorizontal, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { MediaImage } from '@/components/product/media-image';
import { DropdownMenu } from '@/components/ui/menu';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/media';

export type PendingMessage = ChatMessageDto & { pending?: 'sending' | 'failed' };

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

/** 사진 여러 장: 2열 격자, 4장 넘으면 마지막 칸에 +N. 누르면 원본 */
function ImageGrid({ images }: { images: PendingMessage['images'] }) {
  const shown = images.slice(0, 4);
  const rest = images.length - shown.length;
  return (
    <div className="grid w-60 max-w-full grid-cols-2 gap-1">
      {shown.map((img, i) => (
        <a
          key={img.key}
          href={mediaUrl(img.key, 1600)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'relative block aspect-square overflow-hidden rounded-sm',
            images.length === 3 && i === 0 && 'col-span-2 aspect-[2/1]',
          )}
        >
          <MediaImage
            image={img}
            alt={`보낸 사진 ${i + 1}/${images.length}`}
            sizes="120px"
            fit="cover"
            thumb
          />
          {rest > 0 && i === shown.length - 1 && (
            <span className="absolute inset-0 flex items-center justify-center bg-overlay text-body-strong text-white">
              +{rest}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

function Body({ m, mine }: { m: PendingMessage; mine: boolean }) {
  if (m.deleted) return <p className="text-small text-muted italic">삭제된 메시지입니다.</p>;
  if (m.kind === 'IMAGE' && m.images.length > 1) return <ImageGrid images={m.images} />;
  if (m.kind === 'IMAGE' && m.image)
    return (
      <a
        href={mediaUrl(m.image.key, 1600)}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-56 max-w-full"
      >
        <span className="relative block" style={{ aspectRatio: `${m.image.width} / ${m.image.height}` }}>
          <MediaImage image={m.image} alt="보낸 사진" sizes="224px" fit="cover" />
        </span>
      </a>
    );
  if (m.kind === 'PRODUCT' && m.product)
    return (
      <Link
        href={`/products/${m.product.id}`}
        className="flex w-60 max-w-full items-center gap-3 hover:underline"
      >
        <span className="size-14 shrink-0 bg-background">
          <MediaImage image={m.product.image} alt="" sizes="56px" className="p-0.5" />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-small">{m.product.title}</span>
          {m.product.price != null && (
            <span className="tabular text-small font-semibold">{formatPrice(m.product.price)}</span>
          )}
        </span>
      </Link>
    );
  if (m.kind === 'APPOINTMENT' && m.appointment)
    return (
      <div className="flex w-60 max-w-full flex-col gap-1.5">
        <p className="text-label">거래 약속</p>
        <p className="flex items-center gap-1.5 text-small">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          {new Date(m.appointment.at).toLocaleString('ko-KR', {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
        <p className="flex items-center gap-1.5 text-small">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {m.appointment.place}
        </p>
      </div>
    );
  return <p className={cn('text-body break-words whitespace-pre-wrap', mine && 'text-left')}>{m.body}</p>;
}

/** 거래 안내(판매자 상태 변경·주문 진행): 가운데 한 줄, 주문이 있으면 바로가기 */
function SystemLine({ m }: { m: PendingMessage }) {
  const orderId = m.system?.orderId;
  return (
    <p className="mx-auto flex max-w-[90%] flex-wrap items-center justify-center gap-x-2 rounded-full bg-surface-2 px-3.5 py-1.5 text-center text-caption text-muted">
      <span>{m.body}</span>
      {orderId && (
        <Link href={`/orders/${orderId}`} className="font-semibold text-foreground hover:underline">
          주문 보기
        </Link>
      )}
    </p>
  );
}

/** 답장 인용: 누르면 원문으로 스크롤 (불러온 범위 안에 있을 때) */
function Quote({ reply, author }: { reply: NonNullable<PendingMessage['replyTo']>; author: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        document.getElementById(`msg-${reply.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      className="mb-1.5 block w-full border-l-2 border-border-strong pl-2 text-left text-caption"
    >
      <span className="flex items-center gap-1 font-medium text-muted">
        <CornerDownRight className="size-3" aria-hidden />
        {author}에게 답장
      </span>
      <span className={cn('line-clamp-2 text-faint', reply.deleted && 'italic')}>{reply.preview}</span>
    </button>
  );
}

/** 말풍선: 내 메시지 오른쪽, 사진·작품·약속은 카드. 외부 거래 유도 문구에는 안전 안내를 붙인다 */
export function MessageBubble({
  m,
  mine,
  showTime,
  read,
  replyAuthor,
  onReply,
  onDelete,
  onReport,
  onRetry,
}: {
  m: PendingMessage;
  mine: boolean;
  showTime: boolean;
  read: boolean;
  /** 답장 원문을 쓴 사람 ('나' 또는 상대 닉네임) */
  replyAuthor: string | null;
  onReply: () => void;
  onDelete: () => void;
  onReport: () => void;
  onRetry: () => void;
}) {
  if (m.kind === 'SYSTEM') return <SystemLine m={m} />;
  const card = m.kind !== 'TEXT' && !m.deleted;
  return (
    <div id={`msg-${m.id}`} className={cn('group flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <div className={cn('flex max-w-[80%] items-end gap-1.5', mine && 'flex-row-reverse')}>
        <div
          className={cn(
            'rounded-lg',
            card ? 'overflow-hidden border border-border bg-surface p-2' : 'px-3.5 py-2',
            !card && (mine ? 'bg-primary-soft' : 'bg-surface-2'),
            m.pending === 'sending' && 'opacity-60',
          )}
        >
          {m.replyTo && replyAuthor && <Quote reply={m.replyTo} author={replyAuthor} />}
          <Body m={m} mine={mine} />
        </div>
        <div
          className={cn('flex shrink-0 flex-col text-caption text-faint', mine ? 'items-end' : 'items-start')}
        >
          {m.pending === 'failed' ? (
            <button type="button" onClick={onRetry} className="text-destructive underline">
              다시 보내기
            </button>
          ) : (
            <>
              {mine && read && <span className="text-primary">읽음</span>}
              {showTime && !m.pending && <span>{time(m.createdAt)}</span>}
            </>
          )}
        </div>
        {!m.pending && !m.deleted && (
          <DropdownMenu
            trigger={
              <button
                type="button"
                aria-label="메시지 메뉴"
                className="self-center rounded-sm p-1 text-faint opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            }
            items={
              mine
                ? [
                    { label: '답장', onSelect: onReply },
                    { label: '삭제', destructive: true, onSelect: onDelete },
                  ]
                : [
                    { label: '답장', onSelect: onReply },
                    { label: '신고', destructive: true, onSelect: onReport },
                  ]
            }
          />
        )}
      </div>
      {m.warning && !mine && (
        <p className="flex max-w-[80%] items-start gap-1.5 text-caption text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          외부 메신저·계좌로 거래하면 화소의 구매 보호를 받을 수 없어요. 결제는 꼭 화소 안에서 해주세요.
        </p>
      )}
    </div>
  );
}
