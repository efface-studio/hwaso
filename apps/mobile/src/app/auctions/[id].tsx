import { ApiError, newIdempotencyKey } from '@shop/api-client';
import { AUCTION_STATUS_LABEL, formatPrice, formatRemaining, type AuctionDto } from '@shop/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { useAuctionLive } from '@/hooks/use-auction-live';
import { api } from '@/lib/api';
import { useServerNow } from '@/lib/clock';
import { mediaUrl } from '@/lib/media';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const haptic = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(type);
};

function Countdown({ a }: { a: AuctionDto }) {
  const now = useServerNow();
  const target = a.status === 'SCHEDULED' ? Date.parse(a.startsAt) : Date.parse(a.endsAt);
  const left = Math.max(0, target - now);
  const urgent = a.status === 'LIVE' && left < 60_000;
  if (a.status !== 'LIVE' && a.status !== 'SCHEDULED')
    return <Text variant="h2">{AUCTION_STATUS_LABEL[a.status]}</Text>;
  return (
    <View accessibilityLiveRegion={urgent ? 'assertive' : 'none'}>
      <Text variant="caption" color="muted">
        {a.status === 'SCHEDULED' ? '시작까지' : '남은 시간'}
      </Text>
      <Text variant="h1" color={urgent ? 'live' : 'foreground'} style={{ fontVariant: ['tabular-nums'] }}>
        {formatRemaining(left)}
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
  const [amount, setAmount] = useState(a.minNextBid);
  const step = a.bidIncrement;
  return (
    <Sheet title="입찰 금액" onClose={onClose}>
      <Text variant="small" color="muted">
        최소 {formatPrice(a.minNextBid)} · 호가 단위 {formatPrice(step)}
      </Text>
      <View style={styles.stepper}>
        <Button
          title="−"
          variant="outline"
          size="lg"
          disabled={amount - step < a.minNextBid}
          onPress={() => setAmount(amount - step)}
          accessibilityLabel={`${formatPrice(step)} 내리기`}
        />
        <Text variant="priceLg" style={{ flex: 1, textAlign: 'center' }} accessibilityLiveRegion="polite">
          {formatPrice(amount)}
        </Text>
        <Button
          title="+"
          variant="outline"
          size="lg"
          onPress={() => setAmount(amount + step)}
          accessibilityLabel={`${formatPrice(step)} 올리기`}
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
      <Button title={`${formatPrice(amount)} 입찰하기`} size="lg" block onPress={() => onBid(amount)} />
    </Sheet>
  );
}

export default function AuctionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const live = useAuctionLive(id);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  if (live.loading) return <Loading />;
  const s = live.snapshot;
  if (!s) return <Empty title="경매를 찾을 수 없어요" />;
  const a = s.auction;
  const mine = !!user && a.sellerId === user.id;
  const leading = !!user && a.highestBidderId === user.id;
  const won = a.status !== 'LIVE' && !!user && a.winnerId === user.id;

  const place = (amount: number, buyNow = false) => {
    if (!user) return router.push('/login');
    Alert.alert(
      buyNow ? '즉시 구매할까요?' : `${formatPrice(amount)}에 입찰할까요?`,
      buyNow ? '경매가 바로 종료되고 결제 단계로 넘어가요.' : '입찰은 취소할 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: buyNow ? '즉시 구매' : '입찰',
          onPress: async () => {
            setBusy(true);
            setSheet(false);
            try {
              const key = newIdempotencyKey();
              const r = buyNow
                ? await api.auctions.buyNow(a.id, key)
                : await api.auctions.bid(a.id, amount, key);
              haptic(Haptics.NotificationFeedbackType.Success);
              if (r.extended) Alert.alert('마감 직전 입찰로 경매가 연장되었어요');
            } catch (e) {
              haptic(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                '입찰하지 못했어요',
                e instanceof ApiError ? e.message : '네트워크를 확인해주세요.',
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

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: '경매' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 24 }}>
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
                {s.product.artistName ?? '작자 미상'}
              </Text>
              <Text variant="bodyStrong" numberOfLines={2}>
                {s.product.title}
              </Text>
            </View>
          </Pressable>
        </Link>

        <View style={[styles.panel, { borderColor: t.colors.border }]}>
          <Countdown a={a} />
          <View>
            <Text variant="caption" color="muted">
              {a.bidCount ? '현재가' : '시작가'}
            </Text>
            <Text variant="priceLg" accessibilityLiveRegion="polite">
              {formatPrice(a.currentPrice)}
            </Text>
            <Text variant="small" color="muted">
              입찰 {a.bidCount}회 · 참여 {a.bidderCount}명 · 지금 {s.watchers}명이 보는 중
              {live.connected ? '' : ' · 연결 중…'}
            </Text>
          </View>
          {leading && a.status === 'LIVE' && (
            <Text variant="bodyStrong" color="primary">
              현재 최고 입찰자예요
            </Text>
          )}
          {s.myLastBid != null && !leading && a.status === 'LIVE' && (
            <Text variant="small" color="destructive">
              내 마지막 입찰 {formatPrice(s.myLastBid)} — 더 높은 입찰이 있어요
            </Text>
          )}
          {won && (
            <View style={{ gap: 8 }}>
              <Text variant="bodyStrong" color="primary">
                낙찰되었어요! 결제 기한 안에 주문을 결제해주세요.
              </Text>
              <Button
                title="결제하러 가기"
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
            호가 단위 {formatPrice(a.bidIncrement)}
            {a.buyNowPrice ? ` · 즉시 구매가 ${formatPrice(a.buyNowPrice)}` : ''}
            {a.autoExtend ? ` · 종료 ${a.extensionWindowSec}초 안 입찰 시 ${a.extensionSec}초 연장` : ''}
          </Text>
        </View>

        {a.description ? (
          <View style={styles.block}>
            <Text variant="h3">경매 안내</Text>
            <Text>{a.description}</Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text variant="h3" accessibilityRole="header">
            입찰 기록
          </Text>
          {live.bids.length === 0 ? (
            <Text color="muted">아직 입찰이 없어요. 첫 입찰자가 되어보세요.</Text>
          ) : (
            live.bids.map((b) => (
              <View key={b.id} style={[styles.bid, { borderColor: t.colors.borderSoft }]}>
                <Text variant="small" style={{ flex: 1 }}>
                  {b.isMine ? '나' : b.bidderMasked}
                  {b.isBuyNow ? ' · 즉시 구매' : ''}
                </Text>
                <Text variant="small" color="muted">
                  {new Date(b.createdAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Text>
                <Text variant="bodyStrong" style={{ minWidth: 110, textAlign: 'right' }}>
                  {formatPrice(b.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {a.status === 'LIVE' && !mine && (
        <View
          style={[
            styles.bar,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              borderColor: t.colors.border,
              backgroundColor: t.colors.background,
            },
          ]}
        >
          {leading ? (
            <Text variant="bodyStrong" color="primary" style={{ flex: 1, textAlign: 'center' }}>
              최고 입찰 중 — 다른 입찰을 기다려요
            </Text>
          ) : (
            <>
              <Button
                title="금액 입력"
                variant="outline"
                size="lg"
                onPress={() => (user ? setSheet(true) : router.push('/login'))}
              />
              <Button
                title={`${formatPrice(a.minNextBid)} 입찰`}
                size="lg"
                loading={busy}
                style={{ flex: 1 }}
                onPress={() => place(a.minNextBid)}
              />
            </>
          )}
          {a.buyNowPrice != null && !leading && (
            <Button
              title="즉시 구매"
              variant="secondary"
              size="lg"
              onPress={() => place(a.buyNowPrice!, true)}
            />
          )}
        </View>
      )}
      {sheet && <AmountSheet a={a} onClose={() => setSheet(false)} onBid={(n) => place(n)} />}
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
