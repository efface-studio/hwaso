import { ApiError, newIdempotencyKey } from '@shop/api-client';
import { formatRemaining, type AuctionDto, type AuctionSnapshot } from '@shop/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { useAuctionLive } from '@/hooks/use-auction-live';
import { readable, useLayout, useReadableGutter } from '@/hooks/use-layout';
import { dateTimeFormat, formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { askPushInContext } from '@/lib/push-prompt';
import { requireLogin } from '@/lib/require-login';
import { useServerNow } from '@/lib/clock';
import { mediaUrl } from '@/lib/media';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const haptic = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(type);
};

function Countdown({ a }: { a: AuctionDto }) {
  const { t: tr } = useTranslation(['product', 'common']);
  const now = useServerNow();
  const target = a.status === 'SCHEDULED' ? Date.parse(a.startsAt) : Date.parse(a.endsAt);
  const left = Math.max(0, target - now);
  const urgent = a.status === 'LIVE' && left < 60_000;
  // 하루 이상 남으면 일 수만 언어에 맞춰 붙인다 (시:분:초는 formatRemaining 그대로)
  const days = Math.floor(left / 86_400_000);
  const remaining =
    days > 0
      ? tr('auction.daysLeft', { days, time: formatRemaining(left % 86_400_000) })
      : formatRemaining(left);
  if (a.status !== 'LIVE' && a.status !== 'SCHEDULED')
    return <Text variant="h2">{label('auctionStatus', a.status)}</Text>;
  return (
    <View accessibilityLiveRegion={urgent ? 'assertive' : 'none'}>
      <Text variant="caption" color="muted">
        {a.status === 'SCHEDULED' ? tr('auction.untilStart') : tr('auction.timeLeft')}
      </Text>
      <Text variant="h1" color={urgent ? 'live' : 'foreground'} style={{ fontVariant: ['tabular-nums'] }}>
        {remaining}
      </Text>
    </View>
  );
}

/** 금액 직접 입력: 호가 단위로만 올리고 내린다 (서버가 최종 검증) */
function AmountSheet({
  a,
  onClose,
  onBid,
}: {
  a: AuctionDto;
  onClose: () => void;
  onBid: (amount: number) => void;
}) {
  const { t: tr } = useTranslation(['product', 'common']);
  const [amount, setAmount] = useState(a.minNextBid);
  const step = a.bidIncrement;
  return (
    <Sheet title={tr('auction.amountTitle')} onClose={onClose}>
      <Text variant="small" color="muted">
        {tr('auction.amountHint', { min: formatPrice(a.minNextBid), step: formatPrice(step) })}
      </Text>
      <View style={styles.stepper}>
        <Button
          title="−"
          variant="outline"
          size="lg"
          disabled={amount - step < a.minNextBid}
          onPress={() => setAmount(amount - step)}
          accessibilityLabel={tr('auction.decrease', { amount: formatPrice(step) })}
        />
        <Text variant="priceLg" style={{ flex: 1, textAlign: 'center' }} accessibilityLiveRegion="polite">
          {formatPrice(amount)}
        </Text>
        <Button
          title="+"
          variant="outline"
          size="lg"
          onPress={() => setAmount(amount + step)}
          accessibilityLabel={tr('auction.increase', { amount: formatPrice(step) })}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 5, 10].map((n) => (
          <Button
            key={n}
            title={`+${formatPrice(step * n)}`}
            size="sm"
            variant="ghost"
            onPress={() => setAmount(amount + step * n)}
          />
        ))}
      </View>
      <Button
        title={tr('auction.placeBid', { amount: formatPrice(amount) })}
        size="lg"
        block
        onPress={() => onBid(amount)}
      />
    </Sheet>
  );
}

/** 넓은 화면 왼쪽 칸: 작품 사진과 이름 (누르면 작품 상세) */
function ProductPane({ product }: { product: AuctionSnapshot['product'] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('product');
  return (
    <Link href={{ pathname: '/products/[id]', params: { id: product.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        // Link asChild 는 배열 스타일을 넘기지 못한다 — 하나로 합쳐 준다
        style={StyleSheet.flatten([
          styles.pane,
          { backgroundColor: product.image?.dominantColor ?? t.colors.surface2 },
        ])}
      >
        {product.image && (
          <Image
            source={mediaUrl(product.image.key, 1600)}
            placeholder={mediaUrl(product.image.key, 400)}
            placeholderContentFit="contain"
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={t.senior ? 0 : 150}
          />
        )}
        <View style={[styles.paneCaption, { backgroundColor: t.colors.overlay }]}>
          <Text variant="small" style={{ color: '#fff' }} numberOfLines={1}>
            {product.artistName ?? tr('detail.unknownArtist')}
          </Text>
          <Text variant="bodyStrong" style={{ color: '#fff' }} numberOfLines={2}>
            {product.title}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

export default function AuctionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { split, width } = useLayout();
  const gutter = useReadableGutter(12);
  const { t: tr } = useTranslation(['product', 'common']);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const live = useAuctionLive(id);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  if (live.loading) return <Loading variant="detail" />;
  const s = live.snapshot;
  if (!s) return <Empty kind="notfound" title={tr('auction.notFound')} />;
  const a = s.auction;
  const mine = !!user && a.sellerId === user.id;
  const leading = !!user && a.highestBidderId === user.id;
  const won = a.status !== 'LIVE' && !!user && a.winnerId === user.id;

  const place = (amount: number, buyNow = false) => {
    if (!requireLogin()) return;
    Alert.alert(
      buyNow ? tr('auction.confirmBuyNow') : tr('auction.confirmBid', { amount: formatPrice(amount) }),
      buyNow ? tr('auction.buyNowBody') : tr('auction.bidBody'),
      [
        { text: tr('common:action.cancel'), style: 'cancel' },
        {
          text: buyNow ? tr('auction.buyNow') : tr('auction.bid'),
          onPress: async () => {
            setBusy(true);
            setSheet(false);
            try {
              const key = newIdempotencyKey();
              const r = buyNow
                ? await api.auctions.buyNow(a.id, key)
                : await api.auctions.bid(a.id, amount, key);
              haptic(Haptics.NotificationFeedbackType.Success);
              if (r.extended) Alert.alert(tr('auction.extended'));
              else void askPushInContext('bid');
            } catch (e) {
              haptic(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                tr('auction.bidFailed'),
                e instanceof ApiError ? e.message : tr('common:state.network'),
              );
              void qc.invalidateQueries({ queryKey: ['auction', a.id] });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const productRow = (
    <Link href={{ pathname: '/products/[id]', params: { id: s.product.id } }} asChild>
      <Pressable accessibilityRole="link" style={styles.product}>
        <View
          style={[styles.thumb, { backgroundColor: s.product.image?.dominantColor ?? t.colors.surface2 }]}
        >
          {s.product.image && (
            <Image
              source={mediaUrl(s.product.image.key, 400)}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="small" color="muted">
            {s.product.artistName ?? tr('detail.unknownArtist')}
          </Text>
          <Text variant="bodyStrong" numberOfLines={2}>
            {s.product.title}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
  const details = (
    <>
      <View style={[styles.panel, { borderColor: t.colors.border }]}>
        <Countdown a={a} />
        <View>
          <Text variant="caption" color="muted">
            {a.bidCount ? tr('auction.currentPrice') : tr('auction.startPrice')}
          </Text>
          <Text variant="priceLg" accessibilityLiveRegion="polite">
            {formatPrice(a.currentPrice)}
          </Text>
          <Text variant="small" color="muted">
            {tr('auction.stats', { bids: a.bidCount, bidders: a.bidderCount, watchers: s.watchers })}
            {live.connected ? '' : ` · ${tr('auction.connecting')}`}
          </Text>
        </View>
        {leading && a.status === 'LIVE' && (
          <Text variant="bodyStrong" color="primary">
            {tr('auction.leading')}
          </Text>
        )}
        {s.myLastBid != null && !leading && a.status === 'LIVE' && (
          <Text variant="small" color="destructive">
            {tr('auction.outbid', { amount: formatPrice(s.myLastBid) })}
          </Text>
        )}
        {won && (
          <View style={{ gap: 8 }}>
            <Text variant="bodyStrong" color="primary">
              {tr('auction.won')}
            </Text>
            <Button
              title={tr('auction.goPay')}
              onPress={() => router.push({ pathname: '/orders', params: { filter: 'pending' } })}
            />
          </View>
        )}
        {live.notice && (
          <Text variant="small" color="warning" accessibilityLiveRegion="assertive">
            {live.notice.text}
          </Text>
        )}
        <Text variant="caption" color="muted">
          {tr('auction.increment', { amount: formatPrice(a.bidIncrement) })}
          {a.buyNowPrice ? ` · ${tr('auction.buyNowPrice', { amount: formatPrice(a.buyNowPrice) })}` : ''}
          {a.autoExtend
            ? ` · ${tr('auction.autoExtend', { window: a.extensionWindowSec, extension: a.extensionSec })}`
            : ''}
        </Text>
      </View>

      {a.description ? (
        <View style={styles.block}>
          <Text variant="h3">{tr('auction.about')}</Text>
          <Text>{a.description}</Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text variant="h3" accessibilityRole="header">
          {tr('auction.history')}
        </Text>
        {live.bids.length === 0 ? (
          <Text color="muted">{tr('auction.noBids')}</Text>
        ) : (
          live.bids.map((b) => (
            <View key={b.id} style={[styles.bid, { borderColor: t.colors.borderSoft }]}>
              <Text variant="small" style={{ flex: 1 }}>
                {b.isMine ? tr('auction.me') : b.bidderMasked}
                {b.isBuyNow ? ` · ${tr('auction.buyNow')}` : ''}
              </Text>
              <Text variant="small" color="muted">
                {dateTimeFormat({ hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
                  new Date(b.createdAt),
                )}
              </Text>
              <Text variant="bodyStrong" style={{ minWidth: 110, textAlign: 'right' }}>
                {formatPrice(b.amount)}
              </Text>
            </View>
          ))
        )}
      </View>
    </>
  );
  const bar = a.status === 'LIVE' && !mine && (
    <View
      style={[
        styles.bar,
        {
          paddingHorizontal: split ? 12 : gutter,
          paddingBottom: Math.max(insets.bottom, 12),
          borderColor: t.colors.border,
          backgroundColor: t.colors.background,
        },
      ]}
    >
      {leading ? (
        <Text variant="bodyStrong" color="primary" style={{ flex: 1, textAlign: 'center' }}>
          {tr('auction.leadingBar')}
        </Text>
      ) : (
        <>
          <Button
            title={tr('auction.enterAmount')}
            variant="outline"
            size="lg"
            onPress={() => requireLogin() && setSheet(true)}
          />
          <Button
            title={tr('auction.bidShort', { amount: formatPrice(a.minNextBid) })}
            size="lg"
            loading={busy}
            style={{ flex: 1 }}
            onPress={() => place(a.minNextBid)}
          />
        </>
      )}
      {a.buyNowPrice != null && !leading && (
        <Button
          title={tr('auction.buyNow')}
          variant="secondary"
          size="lg"
          onPress={() => place(a.buyNowPrice!, true)}
        />
      )}
    </View>
  );
  const amountSheet = sheet && <AmountSheet a={a} onClose={() => setSheet(false)} onBid={(n) => place(n)} />;

  // 넓은 화면(아이패드 가로 등): 왼쪽 작품 사진 · 오른쪽 경매 정보와 입찰 버튼
  if (split)
    return (
      <View style={[styles.split, { backgroundColor: t.colors.background }]}>
        <Stack.Screen options={{ title: tr('common:screen.auction') }} />
        <ProductPane product={s.product} />
        <View
          style={{
            width: Math.min(Math.max(width * 0.4, 380), 480),
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.border,
          }}
        >
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
          >
            {details}
          </ScrollView>
          {bar}
        </View>
        {amountSheet}
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: tr('common:screen.auction') }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[readable, { paddingBottom: 24 }]}
      >
        {productRow}
        {details}
      </ScrollView>
      {bar}
      {amountSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  pane: { flex: 1, overflow: 'hidden' },
  paneCaption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 2 },
  product: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'center' },
  thumb: { width: 72, height: 72, overflow: 'hidden' },
  panel: {
    marginHorizontal: 16,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 6,
  },
  block: { paddingHorizontal: 16, paddingTop: 24, gap: 8 },
  bid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
