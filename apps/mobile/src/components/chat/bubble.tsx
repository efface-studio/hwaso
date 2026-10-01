import type { ChatMessageDto, SendMessageInput } from '@shop/shared';
import { Link } from 'expo-router';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizePreview, systemText } from '@/components/chat/localize';
import { MediaImage } from '@/components/ui/media-image';
import { Text } from '@/components/ui/text';
import { dateTimeFormat, formatPrice, formatTime } from '@/i18n/format';
import { useTheme } from '@/theme';

export type PendingMessage = ChatMessageDto & { pending?: 'sending' | 'failed'; retry?: SendMessageInput };

function Body({ m }: { m: PendingMessage }) {
  const t = useTheme();
  const { t: tr } = useTranslation('chat');
  if (m.deleted)
    return (
      <Text variant="small" color="muted" style={{ fontStyle: 'italic' }}>
        {tr('message.deleted')}
      </Text>
    );
  if (m.kind === 'IMAGE' && m.images.length > 1) return <ImageGrid images={m.images} />;
  if (m.kind === 'IMAGE' && m.image)
    return (
      <MediaImage
        accessibilityLabel={tr('message.photo')}
        mediaKey={m.image.key}
        displayWidth={200}
        style={{
          width: 200,
          aspectRatio: m.image.width / m.image.height || 1,
          backgroundColor: m.image.dominantColor,
        }}
        contentFit="cover"
      />
    );
  if (m.kind === 'PRODUCT' && m.product)
    return (
      <Link href={{ pathname: '/products/[id]', params: { id: m.product.id } }} asChild>
        <Pressable accessibilityRole="link" style={styles.row}>
          <View style={[styles.thumb, { backgroundColor: t.colors.background }]}>
            {m.product.image && (
              <MediaImage
                mediaKey={m.product.image.key}
                displayWidth={52}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="small" numberOfLines={2}>
              {m.product.title}
            </Text>
            {m.product.price != null && <Text variant="bodyStrong">{formatPrice(m.product.price)}</Text>}
          </View>
        </Pressable>
      </Link>
    );
  if (m.kind === 'APPOINTMENT' && m.appointment)
    return (
      <View style={{ gap: 4, width: 220 }}>
        <Text variant="label">{tr('message.appointment')}</Text>
        <Text variant="small">
          🗓{' '}
          {dateTimeFormat({
            month: 'long',
            day: 'numeric',
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(m.appointment.at))}
        </Text>
        <Text variant="small">📍 {m.appointment.place}</Text>
      </View>
    );
  return <Text selectable>{m.body}</Text>;
}

/** 사진 여러 장: 2열 격자, 4장 넘으면 마지막 칸에 +N */
function ImageGrid({ images }: { images: PendingMessage['images'] }) {
  const { t: tr } = useTranslation('chat');
  const shown = images.slice(0, 4);
  const rest = images.length - shown.length;
  return (
    <View style={styles.grid} accessibilityLabel={tr('message.photos', { count: images.length })}>
      {shown.map((img, i) => (
        <View key={img.key} style={[styles.cell, { backgroundColor: img.dominantColor }]}>
          <MediaImage
            mediaKey={img.key}
            displayWidth={100}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          {rest > 0 && i === shown.length - 1 && (
            <View style={[StyleSheet.absoluteFill, styles.more]}>
              <Text variant="bodyStrong" style={{ color: '#fff' }}>
                +{rest}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** 거래 안내(판매자 상태 변경·주문 진행): 가운데 한 줄, 주문이 있으면 바로가기 */
function SystemLine({ m }: { m: PendingMessage }) {
  const t = useTheme();
  const { t: tr } = useTranslation('chat');
  const orderId = m.system?.orderId;
  return (
    <View style={[styles.system, { backgroundColor: t.colors.surface2 }]}>
      <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
        {m.system ? systemText(m.system.event) : m.body}
      </Text>
      {orderId && (
        <Link href={{ pathname: '/orders/[id]', params: { id: orderId } }} asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <Text variant="caption" style={{ fontWeight: '600' }}>
              {tr('message.viewOrder')}
            </Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

/** 답장 인용 (원문 작성자 · 요약). ponytail: 원문으로 스크롤은 웹만 — 앱은 필요하면 scrollToIndex 로 */
function Quote({ reply, author }: { reply: NonNullable<PendingMessage['replyTo']>; author: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('chat');
  return (
    <View style={[styles.quote, { borderColor: t.colors.borderStrong }]}>
      <Text variant="caption" color="muted">
        ↳ {tr('message.replyTo', { name: author })}
      </Text>
      <Text
        variant="caption"
        color="faint"
        numberOfLines={2}
        style={reply.deleted ? { fontStyle: 'italic' } : undefined}
      >
        {localizePreview(reply)}
      </Text>
    </View>
  );
}

/**
 * 말풍선: 내 메시지 오른쪽, 사진·작품·약속은 카드. 길게 눌러 답장·삭제·신고.
 * 콜백은 메시지를 인자로 받는 고정 함수로 받아, 바뀌지 않은 말풍선은 다시 그리지 않는다.
 */
export const Bubble = memo(function Bubble({
  m,
  mine,
  showTime,
  read,
  replyAuthor,
  onLongPress,
  onRetry,
}: {
  m: PendingMessage;
  mine: boolean;
  showTime: boolean;
  read: boolean;
  /** 답장 원문을 쓴 사람 ('나' 또는 상대 닉네임) */
  replyAuthor: string | null;
  onLongPress: (m: PendingMessage) => void;
  onRetry: (m: PendingMessage) => void;
}) {
  const t = useTheme();
  const { t: tr, i18n } = useTranslation('chat');
  // 보낸 시각은 메시지·언어가 바뀔 때만 다시 계산한다
  const time = useMemo(() => formatTime(m.createdAt), [m.createdAt, i18n.language]);
  if (m.kind === 'SYSTEM') return <SystemLine m={m} />;
  const card = m.kind !== 'TEXT' && !m.deleted;
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
      <View style={[styles.line, mine && { flexDirection: 'row-reverse' }]}>
        <Pressable
          onLongPress={() => onLongPress(m)}
          accessibilityHint={tr('message.longPressHint')}
          style={[
            styles.bubble,
            card
              ? {
                  padding: 8,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: t.colors.border,
                  backgroundColor: t.colors.surface,
                }
              : { backgroundColor: mine ? t.colors.primarySoft : t.colors.surface2 },
            m.pending === 'sending' && { opacity: 0.6 },
          ]}
        >
          {m.replyTo && replyAuthor && <Quote reply={m.replyTo} author={replyAuthor} />}
          <Body m={m} />
        </Pressable>
        <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {m.pending === 'failed' ? (
            <Pressable accessibilityRole="button" onPress={() => onRetry(m)} hitSlop={8}>
              <Text variant="caption" color="destructive">
                {tr('message.retry')}
              </Text>
            </Pressable>
          ) : (
            <>
              {mine && read && (
                <Text variant="caption" color="primary">
                  {tr('message.read')}
                </Text>
              )}
              {showTime && !m.pending && (
                <Text variant="caption" color="faint">
                  {time}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
      {m.warning && !mine && (
        <Text variant="caption" color="warning" style={{ maxWidth: '80%' }}>
          {tr('message.externalWarning')}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 2, paddingLeft: 8, marginBottom: 6 },
  grid: { width: 204, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: 100, height: 100, borderRadius: 6, overflow: 'hidden' },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  system: {
    alignSelf: 'center',
    maxWidth: '90%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '80%' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, overflow: 'hidden', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 220 },
  thumb: { width: 52, height: 52, overflow: 'hidden' },
});
