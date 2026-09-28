import { ApiError } from '@shop/api-client';
import {
  CHAT_IMAGES_MAX,
  CHAT_TRADE_STATUSES,
  formatPrice,
  PRODUCT_STATUS_LABEL,
  type ChatMessageDto,
  type ChatRoomDto,
  type Page,
  type SendMessageInput,
  type ServerToClientEvents,
} from '@shop/shared';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppointmentSheet } from '@/components/chat/appointment-sheet';
import { Bubble, type PendingMessage } from '@/components/chat/bubble';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { mediaUrl } from '@/lib/media';
import { getRealtime } from '@/lib/realtime';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

type Pages = InfiniteData<Page<ChatMessageDto>>;
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '처리하지 못했어요.');
const uuid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const roomKey = ['chat', 'room', id];
  const msgKey = ['chat', 'messages', id];
  const room = useQuery({ queryKey: roomKey, queryFn: () => api.chat.room(id), enabled: !!me });
  const msgs = useInfiniteQuery({
    queryKey: msgKey,
    queryFn: ({ pageParam }) => api.chat.messages(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
  });
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [appointment, setAppointment] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTyping = useRef(0);

  const upsert = useCallback(
    (m: ChatMessageDto) =>
      qc.setQueryData<Pages>(['chat', 'messages', id], (d) => {
        if (!d || d.pages.some((p) => p.items.some((x) => x.id === m.id))) return d;
        const [first, ...rest] = d.pages;
        return { ...d, pages: [{ ...first!, items: [m, ...first!.items] }, ...rest] };
      }),
    [qc, id],
  );
  const markDeleted = useCallback(
    (mid: string) =>
      qc.setQueryData<Pages>(
        ['chat', 'messages', id],
        (d) =>
          d && {
            ...d,
            pages: d.pages.map((p) => ({
              ...p,
              items: p.items.map((x) =>
                x.id === mid ? { ...x, deleted: true, body: null, image: null } : x,
              ),
            })),
          },
      ),
    [qc, id],
  );
  const markRead = useCallback(() => {
    void api.chat
      .read(id)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['chat', 'unread'] });
        void qc.invalidateQueries({ queryKey: ['chat', 'rooms'] });
      })
      .catch(() => undefined);
  }, [id, qc]);

  useEffect(() => {
    if (!me) return;
    const socket = getRealtime();
    const join = () => void socket.emit('chat:join', { roomId: id }, () => undefined);
    join();
    const onMessage: ServerToClientEvents['CHAT_MESSAGE'] = (p) => {
      if (p.roomId !== id) return;
      upsert(p.message);
      setPending((ps) => ps.filter((x) => x.clientId !== p.message.clientId));
      // 거래 상태 안내가 오면 상품 바(상태)를 새로 불러온다
      if (p.message.kind === 'SYSTEM') void qc.invalidateQueries({ queryKey: roomKey });
      if (p.message.senderId !== me.id) {
        setTyping(false);
        markRead();
      }
    };
    const onDeleted: ServerToClientEvents['CHAT_MESSAGE_DELETED'] = (p) =>
      p.roomId === id && markDeleted(p.messageId);
    const onRead: ServerToClientEvents['CHAT_READ'] = (p) => {
      if (p.roomId !== id || p.userId === me.id) return;
      qc.setQueryData<ChatRoomDto>(
        ['chat', 'room', id],
        (r) => r && { ...r, counterpartLastReadAt: p.lastReadAt },
      );
    };
    const onTyping: ServerToClientEvents['CHAT_TYPING'] = (p) => {
      if (p.roomId !== id || p.userId === me.id) return;
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 3000);
    };
    const onConnect = () => {
      join();
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', id] });
    };
    socket.on('CHAT_MESSAGE', onMessage);
    socket.on('CHAT_MESSAGE_DELETED', onDeleted);
    socket.on('CHAT_READ', onRead);
    socket.on('CHAT_TYPING', onTyping);
    socket.on('connect', onConnect);
    markRead();
    const app = AppState.addEventListener('change', (s) => s === 'active' && markRead());
    return () => {
      socket.emit('chat:leave', { roomId: id });
      socket.off('CHAT_MESSAGE', onMessage);
      socket.off('CHAT_MESSAGE_DELETED', onDeleted);
      socket.off('CHAT_READ', onRead);
      socket.off('CHAT_TYPING', onTyping);
      socket.off('connect', onConnect);
      app.remove();
      clearTimeout(typingTimer.current);
    };
  }, [id, me, qc, upsert, markDeleted, markRead]);

  if (!me)
    return (
      <Empty title="로그인이 필요해요" action={{ title: '로그인', onPress: () => router.push('/login') }} />
    );
  if (room.isPending || msgs.isPending) return <Loading />;
  const r = room.data;
  if (!r) return <Empty title="대화를 찾을 수 없어요" />;

  const deliver = (m: PendingMessage, input: SendMessageInput) =>
    api.chat
      .send(id, input)
      .then((saved) => {
        upsert(saved);
        setPending((ps) => ps.filter((x) => x.clientId !== m.clientId));
        void qc.invalidateQueries({ queryKey: ['chat', 'rooms'] });
      })
      .catch((e: unknown) => {
        setPending((ps) =>
          ps.map((x) => (x.clientId === m.clientId ? { ...x, pending: 'failed', retry: input } : x)),
        );
        Alert.alert('보내지 못했어요', errMsg(e));
      });

  const send = (input: Omit<SendMessageInput, 'clientId'>, preview?: Partial<ChatMessageDto>) => {
    const clientId = uuid();
    const draft: PendingMessage = {
      id: clientId,
      roomId: id,
      senderId: me.id,
      kind: input.kind,
      body: input.body ?? null,
      image: null,
      images: [],
      product: null,
      appointment: input.appointment ?? null,
      system: null,
      warning: false,
      clientId,
      deleted: false,
      createdAt: new Date().toISOString(),
      pending: 'sending',
      ...preview,
    };
    setPending((ps) => [...ps, draft]);
    void deliver(draft, { ...input, clientId });
  };

  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send({ kind: 'TEXT', body });
  };

  const attach = () =>
    actionSheet('보내기', [
      { label: '사진 찍기', onPress: () => void sendPhoto('camera') },
      { label: '앨범에서 선택', onPress: () => void sendPhoto('library') },
      ...(r.product
        ? [{ label: '이 작품 보내기', onPress: () => send({ kind: 'PRODUCT', productId: r.product!.id }) }]
        : []),
      { label: '거래 약속 잡기', onPress: () => setAppointment(true) },
    ]);

  const sendPhoto = async (source: 'camera' | 'library') => {
    // 앨범은 여러 장(최대 CHAT_IMAGES_MAX)을 한 메시지로, 카메라는 한 장
    const assets = await pickImages(source, CHAT_IMAGES_MAX);
    if (!assets.length) return;
    try {
      const imgs = await Promise.all(assets.slice(0, CHAT_IMAGES_MAX).map((a) => uploadAsset(a)));
      send({ kind: 'IMAGE', imageKeys: imgs.map((i) => i.key) }, { image: imgs[0], images: imgs });
    } catch (e) {
      Alert.alert('사진을 올리지 못했어요', errMsg(e));
    }
  };

  const menu = () =>
    actionSheet(r.counterpart.nickname, [
      {
        label: r.muted ? '알림 켜기' : '알림 끄기',
        onPress: () =>
          void api.chat.mute(id, !r.muted).then(() => qc.invalidateQueries({ queryKey: roomKey })),
      },
      {
        label: '신고하기',
        onPress: () => router.push({ pathname: '/report', params: { type: 'USER', id: r.counterpart.id } }),
      },
      r.blocked
        ? {
            label: '차단 해제',
            onPress: () =>
              void api.safety
                .unblock(r.counterpart.id)
                .then(() => qc.invalidateQueries({ queryKey: roomKey })),
          }
        : {
            label: '차단하기',
            destructive: true,
            onPress: () =>
              Alert.alert(`${r.counterpart.nickname}님을 차단할까요?`, '서로 메시지를 보낼 수 없게 돼요.', [
                { text: '취소', style: 'cancel' },
                {
                  text: '차단',
                  style: 'destructive',
                  onPress: () =>
                    void api.safety
                      .block(r.counterpart.id)
                      .then(() => qc.invalidateQueries({ queryKey: roomKey })),
                },
              ]),
          },
      {
        label: '채팅방 나가기',
        destructive: true,
        onPress: () =>
          Alert.alert('채팅방을 나갈까요?', '대화 기록이 목록에서 사라져요.', [
            { text: '취소', style: 'cancel' },
            {
              text: '나가기',
              style: 'destructive',
              onPress: () =>
                void api.chat.leave(id).then(() => {
                  void qc.invalidateQueries({ queryKey: ['chat', 'rooms'] });
                  goBack();
                }),
            },
          ]),
      },
    ]);

  const onLongPress = (m: PendingMessage) => {
    if (m.pending || m.deleted) return;
    if (m.senderId === me.id)
      actionSheet('메시지', [
        {
          label: '삭제',
          destructive: true,
          onPress: () =>
            void api.chat
              .deleteMessage(id, m.id)
              .then(() => markDeleted(m.id))
              .catch((e: unknown) => Alert.alert(errMsg(e))),
        },
      ]);
    else
      actionSheet('메시지', [
        {
          label: '신고',
          destructive: true,
          onPress: () => router.push({ pathname: '/report', params: { type: 'MESSAGE', id: m.id } }),
        },
      ]);
  };

  const server = (msgs.data?.pages.flatMap((p) => p.items) ?? []) as PendingMessage[];
  const known = new Set(server.map((m) => m.clientId));
  const items = [...pending.filter((p) => !known.has(p.clientId)).reverse(), ...server];
  const readAt = r.counterpartLastReadAt;
  const lastRead = items.find(
    (m) => m.senderId === me.id && !m.pending && readAt && m.createdAt <= readAt,
  )?.id;
  const canSend = !r.blocked && !r.blockedMe && !r.counterpart.left;

  const buyable = r.role === 'buyer' && r.product?.status === 'ACTIVE' && r.product.saleType !== 'AUCTION';
  const tradable =
    !!r.product &&
    r.product.saleType !== 'AUCTION' &&
    (CHAT_TRADE_STATUSES as readonly string[]).includes(r.product.status);
  /** 판매자: 거래 상태 변경 — 바꾸면 방에 안내가 남는다 */
  const changeTrade = () =>
    actionSheet(
      '거래 상태',
      CHAT_TRADE_STATUSES.filter((s) => s !== r.product?.status).map((s) => ({
        label: PRODUCT_STATUS_LABEL[s],
        onPress: () =>
          void api.chat
            .trade(r.id, s)
            .then(() => qc.invalidateQueries({ queryKey: roomKey }))
            .catch((e: unknown) => Alert.alert('바꾸지 못했어요', errMsg(e))),
      })),
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: r.counterpart.nickname,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="채팅방 메뉴"
              onPress={menu}
              hitSlop={10}
            >
              <Icon ios="ellipsis.circle" android="more_horiz" />
            </Pressable>
          ),
        }}
      />
      {r.product && (
        <Link href={{ pathname: '/products/[id]', params: { id: r.product.id } }} asChild>
          <Pressable
            accessibilityRole="link"
            style={StyleSheet.flatten([styles.product, { borderColor: t.colors.border }])}
          >
            <View
              style={[styles.thumb, { backgroundColor: r.product.image?.dominantColor ?? t.colors.surface2 }]}
            >
              {r.product.image && (
                <Image
                  source={mediaUrl(r.product.image.key, 400)}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="small" numberOfLines={1}>
                {r.product.title}
              </Text>
              <Text variant="bodyStrong">
                {r.product.status === 'SOLD' || r.product.status === 'RESERVED'
                  ? PRODUCT_STATUS_LABEL[r.product.status]
                  : r.product.price != null
                    ? formatPrice(r.product.price)
                    : '경매'}
              </Text>
            </View>
            {buyable && (
              <Button
                title="구매하기"
                size="sm"
                onPress={() => router.push({ pathname: '/checkout', params: { productId: r.product!.id } })}
              />
            )}
            {r.role === 'seller' && tradable && (
              <Button
                title={PRODUCT_STATUS_LABEL[r.product.status]}
                size="sm"
                variant="outline"
                onPress={changeTrade}
              />
            )}
          </Pressable>
        </Link>
      )}
      <FlatList
        inverted
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onEndReached={() => msgs.hasNextPage && !msgs.isFetchingNextPage && void msgs.fetchNextPage()}
        renderItem={({ item, index }) => {
          const newer = items[index - 1];
          const showTime =
            !newer ||
            newer.senderId !== item.senderId ||
            newer.createdAt.slice(0, 16) !== item.createdAt.slice(0, 16);
          return (
            <Bubble
              m={item}
              mine={item.senderId === me.id}
              showTime={showTime}
              read={item.id === lastRead}
              onLongPress={() => onLongPress(item)}
              onRetry={() => {
                if (!item.retry) return;
                setPending((ps) =>
                  ps.map((x) => (x.clientId === item.clientId ? { ...x, pending: 'sending' } : x)),
                );
                void deliver(item, item.retry);
              }}
            />
          );
        }}
        ListHeaderComponent={
          typing ? (
            <Text variant="small" color="muted">
              {r.counterpart.nickname}님이 입력 중…
            </Text>
          ) : null
        }
        ListFooterComponent={
          !msgs.hasNextPage ? (
            <Text variant="caption" color="muted" style={{ textAlign: 'center', marginVertical: 12 }}>
              결제는 화소 안에서 해야 구매 보호를 받을 수 있어요.
            </Text>
          ) : null
        }
      />
      {canSend ? (
        <View
          style={[
            styles.composer,
            { borderColor: t.colors.border, paddingBottom: Math.max(insets.bottom, 8) },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="첨부"
            onPress={attach}
            style={[styles.round, { width: t.touch, height: t.touch }]}
          >
            <Text variant="h2">＋</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="메시지 입력"
            placeholder="메시지를 입력하세요"
            placeholderTextColor={t.colors.faint}
            multiline
            maxLength={1000}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (Date.now() - lastTyping.current > 1000) {
                lastTyping.current = Date.now();
                getRealtime().emit('chat:typing', { roomId: id });
              }
            }}
            style={[
              t.type('body'),
              styles.input,
              { color: t.colors.foreground, backgroundColor: t.colors.surface2, minHeight: t.touch },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="보내기"
            disabled={!text.trim()}
            onPress={sendText}
            style={[
              styles.round,
              {
                width: t.touch,
                height: t.touch,
                backgroundColor: text.trim() ? t.colors.primary : t.colors.surface2,
              },
            ]}
          >
            <Text variant="bodyStrong" color={text.trim() ? 'primaryForeground' : 'faint'}>
              ↑
            </Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.blocked,
            { paddingBottom: Math.max(insets.bottom, 12), borderColor: t.colors.border },
          ]}
        >
          <Text color="muted">
            {r.counterpart.left
              ? '탈퇴한 사용자와는 대화할 수 없어요.'
              : r.blocked
                ? '차단한 사용자예요.'
                : '지금은 이 사용자와 대화할 수 없어요.'}
          </Text>
        </View>
      )}
      {appointment && (
        <AppointmentSheet
          onClose={() => setAppointment(false)}
          onSubmit={(a) => {
            setAppointment(false);
            send({ kind: 'APPOINTMENT', appointment: a });
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 44, height: 44, overflow: 'hidden' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  round: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 128,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  blocked: { alignItems: 'center', padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
