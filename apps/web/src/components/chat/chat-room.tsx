'use client';

import { ApiError } from '@shop/api-client';
import {
  CHAT_TRADE_STATUSES,
  chatPreview,
  formatPrice,
  PRODUCT_STATUS_LABEL,
  type ChatMessageDto,
  type ChatRoomDto,
  type Page,
  type SendMessageInput,
} from '@shop/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { ChevronLeft, MoreVertical, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { MediaImage } from '@/components/product/media-image';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/display';
import { DropdownMenu } from '@/components/ui/menu';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { getRealtime } from '@/lib/realtime';
import { CHAT_ROOMS_KEY, CHAT_UNREAD_KEY } from '@/lib/realtime-sync';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { Composer } from './composer';
import { dayLabel, MessageBubble, type PendingMessage } from './message';

type Pages = InfiniteData<Page<ChatMessageDto>>;
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했습니다.');
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
const sameMinute = (a: string, b: string) => a.slice(0, 16) === b.slice(0, 16);

function ProductBar({ room }: { room: ChatRoomDto }) {
  const p = room.product;
  if (!p) return null;
  const buyable = room.role === 'buyer' && p.status === 'ACTIVE' && p.saleType !== 'AUCTION';
  const tradable = p.saleType !== 'AUCTION' && (CHAT_TRADE_STATUSES as readonly string[]).includes(p.status);
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
      <Link
        href={`/products/${p.id}`}
        className="size-12 shrink-0 bg-background-soft"
        tabIndex={-1}
        aria-hidden
      >
        <MediaImage image={p.image} alt="" sizes="48px" className="p-0.5" />
      </Link>
      <Link href={`/products/${p.id}`} className="min-w-0 flex-1 hover:underline">
        <p className="truncate text-small">{p.title}</p>
        <p className="tabular text-small font-semibold">
          {p.status === 'SOLD'
            ? '판매 완료'
            : p.status === 'RESERVED'
              ? '거래 중'
              : p.price != null
                ? formatPrice(p.price)
                : '경매'}
        </p>
      </Link>
      {buyable && (
        <Button asChild size="sm">
          <Link href={`/checkout?productId=${p.id}`}>구매하기</Link>
        </Button>
      )}
      {room.role === 'seller' && tradable && <TradeStatus room={room} status={p.status as TradeStatus} />}
      {room.role === 'seller' && !tradable && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/sell/${p.id}/edit`}>작품 관리</Link>
        </Button>
      )}
    </div>
  );
}

type TradeStatus = (typeof CHAT_TRADE_STATUSES)[number];

/** 판매자: 채팅에서 거래 상태 변경 — 바꾸면 방에 안내가 남는다 */
function TradeStatus({ room, status }: { room: ChatRoomDto; status: TradeStatus }) {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (s: TradeStatus) => api.chat.trade(room.id, s),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['chat', 'room', room.id] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Select
      size="sm"
      aria-label="거래 상태"
      className="w-28 shrink-0"
      value={status}
      onValueChange={(s) => s !== status && change.mutate(s)}
      options={CHAT_TRADE_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABEL[s] }))}
    />
  );
}

export function ChatRoom({ roomId }: { roomId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const me = useAuthStore((s) => s.user)!;
  const roomKey = ['chat', 'room', roomId];
  const msgKey = ['chat', 'messages', roomId];
  const room = useQuery({ queryKey: roomKey, queryFn: () => api.chat.room(roomId) });
  const msgs = useInfiniteQuery({
    queryKey: msgKey,
    queryFn: ({ pageParam }) => api.chat.messages(roomId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [report, setReport] = useState<{ type: 'USER' | 'MESSAGE'; id: string } | null>(null);
  const [replying, setReplying] = useState<PendingMessage | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTypingEmit = useRef(0);
  const older = useRef<HTMLDivElement>(null);

  const upsert = useCallback(
    (m: ChatMessageDto) =>
      qc.setQueryData<Pages>(['chat', 'messages', roomId], (d) => {
        if (!d || d.pages.some((p) => p.items.some((x) => x.id === m.id))) return d;
        const [first, ...rest] = d.pages;
        return { ...d, pages: [{ ...first!, items: [m, ...first!.items] }, ...rest] };
      }),
    [qc, roomId],
  );
  const markDeleted = useCallback(
    (id: string) =>
      qc.setQueryData<Pages>(
        ['chat', 'messages', roomId],
        (d) =>
          d && {
            ...d,
            pages: d.pages.map((p) => ({
              ...p,
              items: p.items.map((x) => (x.id === id ? { ...x, deleted: true, body: null, image: null } : x)),
            })),
          },
      ),
    [qc, roomId],
  );
  const markRead = useCallback(() => {
    void api.chat
      .read(roomId)
      .then(() => {
        void qc.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
        void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY });
      })
      .catch(() => undefined);
  }, [roomId, qc]);

  // 실시간: 입장(입력 중 표시용) + 개인 룸으로 오는 메시지·읽음·삭제
  useEffect(() => {
    const socket = getRealtime();
    const join = () => void socket.emit('chat:join', { roomId }, () => undefined);
    join();
    const onMessage = (p: { roomId: string; message: ChatMessageDto }) => {
      if (p.roomId !== roomId) return;
      upsert(p.message);
      setPending((ps) => ps.filter((x) => x.clientId !== p.message.clientId));
      // 거래 상태 안내가 오면 상품 바(상태)를 새로 불러온다
      if (p.message.kind === 'SYSTEM') void qc.invalidateQueries({ queryKey: ['chat', 'room', roomId] });
      if (p.message.senderId !== me.id) {
        setTyping(false);
        markRead();
      }
    };
    const onDeleted = (p: { roomId: string; messageId: string }) =>
      p.roomId === roomId && markDeleted(p.messageId);
    const onRead = (p: { roomId: string; userId: string; lastReadAt: string }) => {
      if (p.roomId !== roomId || p.userId === me.id) return;
      qc.setQueryData<ChatRoomDto>(
        ['chat', 'room', roomId],
        (r) => r && { ...r, counterpartLastReadAt: p.lastReadAt },
      );
    };
    const onTyping = (p: { roomId: string; userId: string }) => {
      if (p.roomId !== roomId || p.userId === me.id) return;
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 3000);
    };
    // 재연결 시 방에 다시 들어가고 놓친 메시지를 다시 불러온다
    const onReconnect = () => {
      join();
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', roomId] });
    };
    socket.on('CHAT_MESSAGE', onMessage);
    socket.on('CHAT_MESSAGE_DELETED', onDeleted);
    socket.on('CHAT_READ', onRead);
    socket.on('CHAT_TYPING', onTyping);
    socket.on('connect', onReconnect);
    markRead();
    window.addEventListener('focus', markRead);
    return () => {
      socket.emit('chat:leave', { roomId });
      socket.off('CHAT_MESSAGE', onMessage);
      socket.off('CHAT_MESSAGE_DELETED', onDeleted);
      socket.off('CHAT_READ', onRead);
      socket.off('CHAT_TYPING', onTyping);
      socket.off('connect', onReconnect);
      window.removeEventListener('focus', markRead);
      clearTimeout(typingTimer.current);
    };
  }, [roomId, me.id, qc, upsert, markDeleted, markRead]);

  // 위로 스크롤하면 이전 메시지 자동 로드
  useEffect(() => {
    const el = older.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && msgs.hasNextPage && !msgs.isFetchingNextPage) void msgs.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [msgs]);

  const deliver = (m: PendingMessage) => {
    const { kind, body, appointment, clientId } = m;
    const input = {
      kind,
      clientId,
      ...(body ? { body } : {}),
      ...(appointment ? { appointment } : {}),
    } as SendMessageInput;
    return api.chat
      .send(roomId, {
        ...input,
        ...(m.product ? { productId: m.product.id } : {}),
        ...(m.images.length ? { imageKeys: m.images.map((i) => i.key) } : {}),
        ...(m.replyTo ? { replyToId: m.replyTo.id } : {}),
      })
      .then((saved) => {
        upsert(saved);
        setPending((ps) => ps.filter((x) => x.clientId !== clientId));
        void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY });
      })
      .catch((e: unknown) => {
        setPending((ps) => ps.map((x) => (x.clientId === clientId ? { ...x, pending: 'failed' } : x)));
        toast.error(errMsg(e));
      });
  };

  const send = (input: Omit<SendMessageInput, 'clientId'>) => {
    const clientId = crypto.randomUUID();
    // 올리는 중 자리 표시 (실제 크기는 서버 응답으로 바뀐다)
    const images = (input.imageKeys ?? (input.imageKey ? [input.imageKey] : [])).map((key) => ({
      key,
      width: 1,
      height: 1,
      dominantColor: '#ddd',
    }));
    const draft: PendingMessage = {
      id: clientId,
      roomId,
      senderId: me.id,
      kind: input.kind,
      body: input.body ?? null,
      image: images[0] ?? null,
      images,
      product: input.productId && room.data?.product ? { ...room.data.product, id: input.productId } : null,
      appointment: input.appointment ?? null,
      system: null,
      replyTo: replying
        ? {
            id: replying.id,
            senderId: replying.senderId,
            kind: replying.kind,
            preview: chatPreview({ ...replying, imageCount: replying.images.length }),
            deleted: false,
          }
        : null,
      warning: false,
      clientId,
      deleted: false,
      createdAt: new Date().toISOString(),
      pending: 'sending',
    };
    setPending((ps) => [...ps, draft]);
    setReplying(null);
    void deliver(draft);
  };

  const emitTyping = () => {
    if (Date.now() - lastTypingEmit.current < 1000) return;
    lastTypingEmit.current = Date.now();
    getRealtime().emit('chat:typing', { roomId });
  };

  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: roomKey });
      void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (room.isPending || msgs.isPending) return <Skeleton className="m-4 h-80 w-full" />;
  if (room.error || !room.data)
    return (
      <div className="p-6">
        <Alert tone="destructive" title="대화를 찾을 수 없어요">
          {errMsg(room.error)}
        </Alert>
      </div>
    );

  const r = room.data;
  const server = (msgs.data?.pages.flatMap((p) => p.items) ?? []) as PendingMessage[];
  const serverClientIds = new Set(server.map((m) => m.clientId));
  const items = [...pending.filter((p) => !serverClientIds.has(p.clientId)).reverse(), ...server];
  const readAt = r.counterpartLastReadAt;
  const lastReadMine = items.find(
    (m) => m.senderId === me.id && !m.pending && readAt && m.createdAt <= readAt,
  )?.id;
  const canSend = !r.blocked && !r.blockedMe && !r.counterpart.left;

  return (
    <div className="flex size-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-2 py-2 md:px-4">
        <Link href="/chat" aria-label="채팅 목록" className="p-2 md:hidden">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <Link
          href={`/users/${r.counterpart.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
        >
          <Avatar avatarKey={r.counterpart.avatarKey} name={r.counterpart.nickname} size="sm" />
          <span className="truncate text-body-strong">{r.counterpart.nickname}</span>
        </Link>
        <DropdownMenu
          trigger={
            <button type="button" aria-label="채팅방 메뉴" className="rounded-sm p-2 hover:bg-surface-2">
              <MoreVertical className="size-5" aria-hidden />
            </button>
          }
          items={[
            {
              label: r.muted ? '알림 켜기' : '알림 끄기',
              onSelect: () => act.mutate(() => api.chat.mute(roomId, !r.muted)),
            },
            { label: '신고하기', onSelect: () => setReport({ type: 'USER', id: r.counterpart.id }) },
            r.blocked
              ? { label: '차단 해제', onSelect: () => act.mutate(() => api.safety.unblock(r.counterpart.id)) }
              : {
                  label: '차단하기',
                  destructive: true,
                  onSelect: () =>
                    confirm(`${r.counterpart.nickname}님을 차단할까요? 서로 메시지를 보낼 수 없게 돼요.`) &&
                    act.mutate(() => api.safety.block(r.counterpart.id)),
                },
            {
              label: '채팅방 나가기',
              destructive: true,
              onSelect: () =>
                confirm('채팅방을 나갈까요? 대화 기록이 목록에서 사라져요.') &&
                void api.chat.leave(roomId).then(() => {
                  void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY });
                  router.push('/chat');
                }),
            },
          ]}
        />
      </header>
      <ProductBar room={r} />

      <div
        className="flex min-h-0 flex-1 flex-col-reverse gap-2 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {typing && <p className="text-small text-muted">{r.counterpart.nickname}님이 입력 중…</p>}
        {items.map((m, i) => {
          const newer = items[i - 1];
          const olderMsg = items[i + 1];
          const showTime =
            !newer || newer.senderId !== m.senderId || !sameMinute(newer.createdAt, m.createdAt);
          return (
            <Fragment key={m.id}>
              <MessageBubble
                m={m}
                mine={m.senderId === me.id}
                showTime={showTime}
                read={m.id === lastReadMine}
                replyAuthor={m.replyTo && (m.replyTo.senderId === me.id ? '나' : r.counterpart.nickname)}
                onReply={() => setReplying(m)}
                onDelete={() =>
                  confirm('메시지를 삭제할까요? 상대방에게도 삭제된 메시지로 보여요.') &&
                  act.mutate(() => api.chat.deleteMessage(roomId, m.id).then(() => markDeleted(m.id)))
                }
                onReport={() => setReport({ type: 'MESSAGE', id: m.id })}
                onRetry={() => {
                  setPending((ps) =>
                    ps.map((x) => (x.clientId === m.clientId ? { ...x, pending: 'sending' } : x)),
                  );
                  void deliver(m);
                }}
              />
              {(!olderMsg || !sameDay(olderMsg.createdAt, m.createdAt)) && (
                <p className="my-2 self-center rounded-full bg-surface-2 px-3 py-1 text-caption text-muted">
                  {dayLabel(m.createdAt)}
                </p>
              )}
            </Fragment>
          );
        })}
        <div ref={older} className="h-1 shrink-0" />
        {!msgs.hasNextPage && (
          <p className="my-3 flex items-center justify-center gap-1.5 self-center text-center text-caption text-muted">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            결제는 화소 안에서 해야 구매 보호를 받을 수 있어요.
          </p>
        )}
      </div>

      {canSend ? (
        <Composer
          productId={r.product?.id ?? null}
          onSend={send}
          onTyping={emitTyping}
          replying={
            replying && {
              author: replying.senderId === me.id ? '나' : r.counterpart.nickname,
              preview: chatPreview({ ...replying, imageCount: replying.images.length }),
            }
          }
          onCancelReply={() => setReplying(null)}
        />
      ) : (
        <div className="flex items-center justify-center gap-3 border-t border-border p-4 text-small text-muted">
          {r.counterpart.left
            ? '탈퇴한 사용자와는 대화할 수 없어요.'
            : r.blocked
              ? '차단한 사용자예요.'
              : '지금은 이 사용자와 대화할 수 없어요.'}
          {r.blocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => act.mutate(() => api.safety.unblock(r.counterpart.id))}
            >
              차단 해제
            </Button>
          )}
        </div>
      )}
      {report && (
        <ReportDialog
          open
          onOpenChange={(v) => !v && setReport(null)}
          targetType={report.type}
          targetId={report.id}
        />
      )}
    </div>
  );
}
