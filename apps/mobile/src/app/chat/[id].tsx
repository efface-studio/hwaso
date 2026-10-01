import { ApiError } from '@shop/api-client';
import {
  CHAT_IMAGES_MAX,
  CHAT_TRADE_STATUSES,
  chatPreview,
  type ChatMessageDto,
  type ChatRoomDto,
  type Page,
  type SendMessageInput,
  type ServerToClientEvents,
} from '@shop/shared';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, router, Stack, useLocalSearchParams, type NativeStackNavigationOptions } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppointmentSheet } from '@/components/chat/appointment-sheet';
import { Bubble, type PendingMessage } from '@/components/chat/bubble';
import { Composer, type ComposerHandle } from '@/components/chat/composer';
import { localizePreview, presenceText } from '@/components/chat/localize';
import { PhrasesSheet } from '@/components/chat/phrases-sheet';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { askPushInContext } from '@/lib/push-prompt';
import { goBack } from '@/lib/nav';
import { mediaUrl } from '@/lib/media';
import { getRealtime } from '@/lib/realtime';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';
import { readable, useReadableGutter } from '@/hooks/use-layout';

type Pages = InfiniteData<Page<ChatMessageDto>>;
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('common:state.actionFailed'));
const uuid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { t: tr } = useTranslation(['chat', 'common']);
  const insets = useSafeAreaInsets();
  // 넓은 화면: 말풍선은 본문 폭(readable) 안에, 위·아래 바도 같은 폭에 맞춘다
  const gutter = useReadableGutter(12);
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const roomKey = useMemo(() => ['chat', 'room', id], [id]);
  const msgKey = ['chat', 'messages', id];
  // 접속 상태를 보여주려고 1분마다 다시 불러온다
  const room = useQuery({
    queryKey: roomKey,
    queryFn: () => api.chat.room(id),
    enabled: !!me,
    refetchInterval: 60_000,
  });
  const msgs = useInfiniteQuery({
    queryKey: msgKey,
    queryFn: ({ pageParam }) => api.chat.messages(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
  });
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [appointment, setAppointment] = useState(false);
  const [phrases, setPhrases] = useState(false);
  const [replying, setReplying] = useState<PendingMessage | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    // 백그라운드로 가면 방에서 나가 푸시를 받고, 돌아오면 다시 들어와 읽음 처리
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return void socket.emit('chat:leave', { roomId: id });
      join();
      markRead();
    });
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

  const deliver = useCallback(
    (m: PendingMessage, input: SendMessageInput) =>
      api.chat
        .send(id, input)
        .then((saved) => {
          upsert(saved);
          setPending((ps) => ps.filter((x) => x.clientId !== m.clientId));
          void qc.invalidateQueries({ queryKey: ['chat', 'rooms'] });
          // 첫 메시지를 보낸 뒤 맥락에 맞춰 알림 권한을 묻는다 (이미 정했으면 아무것도 하지 않는다)
          void askPushInContext('chat');
        })
        .catch((e: unknown) => {
          setPending((ps) =>
            ps.map((x) => (x.clientId === m.clientId ? { ...x, pending: 'failed', retry: input } : x)),
          );
          Alert.alert(tr('errors.sendFailed'), errMsg(e));
        }),
    [id, upsert, qc, tr],
  );

  // 말풍선에 넘기는 콜백은 메시지를 인자로 받아 한 번만 만든다 (바뀌지 않은 말풍선은 다시 그리지 않게)
  const onLongPress = useCallback(
    (m: PendingMessage) => {
      if (m.pending || m.deleted) return;
      const reply = {
        label: tr('message.reply'),
        onPress: () => {
          setReplying(m);
          composer.current?.focus();
        },
      };
      if (m.senderId === me?.id)
        actionSheet(tr('message.menuTitle'), [
          reply,
          {
            label: tr('common:action.delete'),
            destructive: true,
            onPress: () =>
              void api.chat
                .deleteMessage(id, m.id)
                .then(() => markDeleted(m.id))
                .catch((e: unknown) => Alert.alert(errMsg(e))),
          },
        ]);
      else
        actionSheet(tr('message.menuTitle'), [
          reply,
          {
            label: tr('common:action.report'),
            destructive: true,
            onPress: () => router.push({ pathname: '/report', params: { type: 'MESSAGE', id: m.id } }),
          },
        ]);
    },
    [id, me, tr, markDeleted],
  );

  const onRetry = useCallback(
    (m: PendingMessage) => {
      if (!m.retry) return;
      setPending((ps) => ps.map((x) => (x.clientId === m.clientId ? { ...x, pending: 'sending' } : x)));
      void deliver(m, m.retry);
    },
    [deliver],
  );

  // 목록은 메시지·보내는 중인 메시지가 바뀔 때만 다시 만든다
  const items = useMemo(() => {
    const server = (msgs.data?.pages.flatMap((p) => p.items) ?? []) as PendingMessage[];
    const known = new Set(server.map((m) => m.clientId));
    return [...pending.filter((p) => !known.has(p.clientId)).reverse(), ...server];
  }, [msgs.data, pending]);
  const readAt = room.data?.counterpartLastReadAt;
  const lastRead = useMemo(
    () => items.find((m) => m.senderId === me?.id && !m.pending && readAt && m.createdAt <= readAt)?.id,
    [items, me, readAt],
  );
  const counterpartName = room.data?.counterpart.nickname;
  const authorOf = useCallback(
    (senderId: string) => (senderId === me?.id ? tr('room.me') : (counterpartName ?? '')),
    [me, tr, counterpartName],
  );

  const renderItem = useCallback<ListRenderItem<PendingMessage>>(
    ({ item, index }) => {
      const newer = items[index - 1];
      const showTime =
        !newer ||
        newer.senderId !== item.senderId ||
        newer.createdAt.slice(0, 16) !== item.createdAt.slice(0, 16);
      return (
        <Bubble
          m={item}
          mine={item.senderId === me?.id}
          showTime={showTime}
          read={item.id === lastRead}
          replyAuthor={item.replyTo && authorOf(item.replyTo.senderId)}
          onLongPress={onLongPress}
          onRetry={onRetry}
        />
      );
    },
    [items, me, lastRead, authorOf, onLongPress, onRetry],
  );

  // 헤더(이름·접속 상태·메뉴)는 방 정보가 바뀔 때만 새로 만든다 — 렌더마다 setOptions 가 불리지 않게
  const r = room.data;
  const headerOptions = useMemo<NativeStackNavigationOptions | undefined>(() => {
    if (!r) return undefined;
    const presence = presenceText(r.counterpart);
    const menu = () =>
      actionSheet(r.counterpart.nickname, [
        {
          label: r.muted ? tr('menu.unmute') : tr('menu.mute'),
          onPress: () =>
            void api.chat.mute(id, !r.muted).then(() => qc.invalidateQueries({ queryKey: roomKey })),
        },
        {
          label: r.pinned ? tr('menu.unpin') : tr('menu.pin'),
          onPress: () =>
            void api.chat.pin(id, !r.pinned).then(() => {
              void qc.invalidateQueries({ queryKey: roomKey });
              void qc.invalidateQueries({ queryKey: ['chat', 'rooms'] });
            }),
        },
        {
          label: tr('menu.report'),
          onPress: () => router.push({ pathname: '/report', params: { type: 'USER', id: r.counterpart.id } }),
        },
        r.blocked
          ? {
              label: tr('menu.unblock'),
              onPress: () =>
                void api.safety
                  .unblock(r.counterpart.id)
                  .then(() => qc.invalidateQueries({ queryKey: roomKey })),
            }
          : {
              label: tr('menu.block'),
              destructive: true,
              onPress: () =>
                Alert.alert(tr('block.title', { name: r.counterpart.nickname }), tr('block.message'), [
                  { text: tr('common:action.cancel'), style: 'cancel' },
                  {
                    text: tr('block.confirm'),
                    style: 'destructive',
                    onPress: () =>
                      void api.safety
                        .block(r.counterpart.id)
                        .then(() => qc.invalidateQueries({ queryKey: roomKey })),
                  },
                ]),
            },
        {
          label: tr('menu.leave'),
          destructive: true,
          onPress: () =>
            Alert.alert(tr('leave.title'), tr('leave.message'), [
              { text: tr('common:action.cancel'), style: 'cancel' },
              {
                text: tr('leave.confirm'),
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
    return {
      title: r.counterpart.nickname,
      headerTitle: () => (
        <View style={{ alignItems: 'center' }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {r.counterpart.nickname}
          </Text>
          {presence && (
            <Text variant="caption" color={r.counterpart.online ? 'primary' : 'faint'}>
              {presence}
            </Text>
          )}
        </View>
      ),
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('room.menuLabel')}
          onPress={menu}
          hitSlop={10}
        >
          <Icon ios="ellipsis.circle" android="more_horiz" />
        </Pressable>
      ),
    };
  }, [r, id, qc, roomKey, tr]);

  if (!me)
    return (
      <Empty
        kind="lock"
        title={tr('room.loginRequired')}
        action={{ title: tr('login'), onPress: () => router.push('/login') }}
      />
    );
  if (room.isPending || msgs.isPending) return <Loading variant="plain-list" />;
  if (!r) return <Empty kind="notfound" title={tr('room.notFound')} />;

  const replyPreview = (m: PendingMessage) => chatPreview({ ...m, imageCount: m.images.length });

  const send = (input: Omit<SendMessageInput, 'clientId'>, preview?: Partial<ChatMessageDto>) => {
    const clientId = uuid();
    const replyTo = replying && {
      id: replying.id,
      senderId: replying.senderId,
      kind: replying.kind,
      preview: replyPreview(replying),
      deleted: false,
    };
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
      replyTo,
      warning: false,
      clientId,
      deleted: false,
      createdAt: new Date().toISOString(),
      pending: 'sending',
      ...preview,
    };
    setPending((ps) => [...ps, draft]);
    setReplying(null);
    void deliver(draft, { ...input, clientId, ...(replyTo ? { replyToId: replyTo.id } : {}) });
  };

  const attach = () =>
    actionSheet(tr('attach.title'), [
      { label: tr('attach.camera'), onPress: () => void sendPhoto('camera') },
      { label: tr('attach.library'), onPress: () => void sendPhoto('library') },
      ...(r.product
        ? [
            {
              label: tr('attach.product'),
              onPress: () => send({ kind: 'PRODUCT', productId: r.product!.id }),
            },
          ]
        : []),
      { label: tr('attach.phrases'), onPress: () => setPhrases(true) },
      { label: tr('attach.appointment'), onPress: () => setAppointment(true) },
    ]);

  const sendPhoto = async (source: 'camera' | 'library') => {
    // 앨범은 여러 장(최대 CHAT_IMAGES_MAX)을 한 메시지로, 카메라는 한 장
    const assets = await pickImages(source, CHAT_IMAGES_MAX);
    if (!assets.length) return;
    try {
      const imgs = await Promise.all(assets.slice(0, CHAT_IMAGES_MAX).map((a) => uploadAsset(a)));
      send({ kind: 'IMAGE', imageKeys: imgs.map((i) => i.key) }, { image: imgs[0], images: imgs });
    } catch (e) {
      Alert.alert(tr('errors.uploadFailed'), errMsg(e));
    }
  };

  const canSend = !r.blocked && !r.blockedMe && !r.counterpart.left;

  const buyable = r.role === 'buyer' && r.product?.status === 'ACTIVE' && r.product.saleType !== 'AUCTION';
  const tradable =
    !!r.product &&
    r.product.saleType !== 'AUCTION' &&
    (CHAT_TRADE_STATUSES as readonly string[]).includes(r.product.status);
  /** 판매자: 거래 상태 변경 — 바꾸면 방에 안내가 남는다 */
  const changeTrade = () =>
    actionSheet(
      tr('room.tradeTitle'),
      CHAT_TRADE_STATUSES.filter((s) => s !== r.product?.status).map((s) => ({
        label: label('productStatus', s),
        onPress: () =>
          void api.chat
            .trade(r.id, s)
            .then(() => qc.invalidateQueries({ queryKey: roomKey }))
            .catch((e: unknown) => Alert.alert(tr('errors.tradeFailed'), errMsg(e))),
      })),
    );

  return (
    // 키보드만큼 아래를 비워 입력창을 키보드 바로 위에 붙인다 (헤더 높이는 automaticOffset 이 잰다).
    // 입력창 아래 안전 영역 여백은 키보드가 덮으므로 그만큼 덜 올린다
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      behavior="padding"
      automaticOffset
      keyboardVerticalOffset={canSend ? 8 - Math.max(insets.bottom, 8) : 0}
    >
      <Stack.Screen options={headerOptions} />
      {r.product && (
        <Link href={{ pathname: '/products/[id]', params: { id: r.product.id } }} asChild>
          <Pressable
            accessibilityRole="link"
            style={StyleSheet.flatten([
              styles.product,
              { borderColor: t.colors.border, paddingHorizontal: gutter },
            ])}
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
                  ? label('productStatus', r.product.status)
                  : r.product.price != null
                    ? formatPrice(r.product.price)
                    : label('saleType', 'AUCTION')}
              </Text>
            </View>
            {buyable && (
              <Button
                title={tr('room.buy')}
                size="sm"
                onPress={() => router.push({ pathname: '/checkout', params: { productId: r.product!.id } })}
              />
            )}
            {r.role === 'seller' && tradable && (
              <Button
                title={label('productStatus', r.product.status)}
                size="sm"
                variant="outline"
                onPress={changeTrade}
              />
            )}
          </Pressable>
        </Link>
      )}
      <FlatList
        alwaysBounceVertical={false}
        inverted
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[readable, { flexGrow: 1, padding: 16, gap: 8 }]}
        onEndReached={() => msgs.hasNextPage && !msgs.isFetchingNextPage && void msgs.fetchNextPage()}
        renderItem={renderItem}
        ListHeaderComponent={
          typing ? (
            <Text variant="small" color="muted">
              {tr('room.typing', { name: r.counterpart.nickname })}
            </Text>
          ) : null
        }
        ListFooterComponent={
          !msgs.hasNextPage ? (
            <Text variant="caption" color="muted" style={{ textAlign: 'center', marginVertical: 12 }}>
              {tr('room.safetyFooter')}
            </Text>
          ) : null
        }
      />
      {canSend && replying && (
        <Animated.View
          entering={FadeInDown.duration(160)}
          style={[
            styles.replyBar,
            { borderColor: t.colors.border, paddingLeft: gutter + 4, paddingRight: gutter - 4 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text variant="caption">{tr('message.replyTo', { name: authorOf(replying.senderId) })}</Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {localizePreview({ kind: replying.kind, preview: replyPreview(replying) })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('composer.cancelReply')}
            onPress={() => setReplying(null)}
            hitSlop={8}
            style={[styles.round, { width: t.touch, height: t.touch }]}
          >
            <Text color="muted">✕</Text>
          </Pressable>
        </Animated.View>
      )}
      {canSend ? (
        <Composer
          ref={composer}
          roomId={id}
          onSend={(body) => send({ kind: 'TEXT', body })}
          onAttach={attach}
        />
      ) : (
        <View
          style={[
            styles.blocked,
            { paddingBottom: Math.max(insets.bottom, 12), borderColor: t.colors.border },
          ]}
        >
          <Text color="muted">
            {r.counterpart.left
              ? tr('room.unavailable.left')
              : r.blocked
                ? tr('room.unavailable.blocked')
                : tr('room.unavailable.other')}
          </Text>
        </View>
      )}
      {phrases && (
        <PhrasesSheet
          onClose={() => setPhrases(false)}
          onPick={(p) => {
            composer.current?.append(p);
            setPhrases(false);
            composer.current?.focus();
          }}
        />
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
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  round: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  blocked: { alignItems: 'center', padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
