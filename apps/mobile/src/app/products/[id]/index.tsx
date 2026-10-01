import { ApiError } from '@shop/api-client';
import { formatDimensions, type ProductDetailDto } from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rail } from '@/components/home/rail';
import { Button } from '@/components/ui/button';
import { Gallery } from '@/components/product/gallery';
import { Inquiries } from '@/components/product/inquiries';
import { Avatar } from '@/components/ui/avatar';
import { FormScroll } from '@/components/ui/form-scroll';
import { Empty, Loading } from '@/components/ui/state';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { currentLanguage, LOCALE } from '@/i18n';
import { formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { askPushInContext } from '@/lib/push-prompt';
import { requireLogin } from '@/lib/require-login';
import { env } from '@/lib/env';
import { productQuery } from '@/lib/product-query';
import { selectionHaptic } from '@/lib/haptics';
import { useLayout, useReadableGutter } from '@/hooks/use-layout';
import { useTheme } from '@/theme';

function Spec({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.spec}>
      <Text variant="small" color="muted" style={{ width: 88 }}>
        {label}
      </Text>
      <Text variant="small" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.section, { borderColor: t.colors.border }]}>
      <Text variant="h3" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE[currentLanguage()], {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 판매 방식별 CTA (웹 PurchasePanel 과 같은 규칙). 가격·경매 상태는 서버 값만 쓴다 */
function Cta({ p }: { p: ProductDetailDto }) {
  const { t: tr } = useTranslation(['product', 'common']);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () => api.orders.putCart(p.id, 1),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      Alert.alert(tr('cta.addedToCart'), undefined, [
        { text: tr('cta.keepBrowsing'), style: 'cancel' },
        { text: tr('cta.viewCart'), onPress: () => router.push('/cart') },
      ]);
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : tr('cta.addFailed')),
  });
  const disabled = (title: string) => <Button title={title} size="lg" disabled block />;
  if (p.isMine)
    return (
      <Button
        title={tr('cta.manage')}
        variant="outline"
        size="lg"
        block
        onPress={() => router.push({ pathname: '/sell/[id]/edit', params: { id: p.id } })}
      />
    );
  if (p.status === 'SOLD') return disabled(tr('cta.sold'));
  if (p.status === 'RESERVED') return disabled(tr('cta.reserved'));
  if (p.saleType === 'AUCTION' && p.auction) {
    const a = p.auction;
    return (
      <Button
        title={
          a.status === 'LIVE'
            ? tr('cta.joinAuction')
            : a.status === 'SCHEDULED'
              ? tr('cta.viewAuction')
              : tr('cta.auctionResult')
        }
        size="lg"
        block
        onPress={() => router.push({ pathname: '/auctions/[id]', params: { id: a.id } })}
      />
    );
  }
  if (p.saleType === 'RESERVATION' && p.availableAt && Date.parse(p.availableAt) > Date.now())
    return disabled(tr('cta.availableFrom', { date: when(p.availableAt) }));
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button
        title={tr('cta.cart')}
        variant="outline"
        size="lg"
        loading={add.isPending}
        onPress={() => requireLogin() && add.mutate()}
      />
      <Button
        title={tr('cta.buy')}
        size="lg"
        style={{ flex: 1 }}
        onPress={() => requireLogin() && router.push({ pathname: '/checkout', params: { productId: p.id } })}
      />
    </View>
  );
}

/** 하단 고정 바: 관심 · 공유 · 채팅 + 판매 방식별 CTA */
function BottomBar({ p, inPane = false }: { p: ProductDetailDto; inPane?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['product', 'common']);
  const insets = useSafeAreaInsets();
  // 두 칸 배치에서는 오른쪽 칸 안에 놓이므로 칸 폭 그대로, 아니면 본문 폭에 맞춘다
  const gutter = useReadableGutter(12);
  const qc = useQueryClient();
  const [fav, setFav] = useState({ on: p.isFavorite, count: p.favoriteCount });
  const [opening, setOpening] = useState(false);
  const chat = async () => {
    if (!requireLogin()) return;
    setOpening(true);
    try {
      const { id } = await api.chat.open(p.id);
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : tr('bar.chatFailed'));
    } finally {
      setOpening(false);
    }
  };
  const toggle = async () => {
    if (!requireLogin()) return;
    const next = { on: !fav.on, count: fav.count + (fav.on ? -1 : 1) };
    setFav(next);
    try {
      await (next.on ? api.market.favorite(p.id) : api.market.unfavorite(p.id));
      void qc.invalidateQueries({ queryKey: ['favorites'] });
      if (next.on) void askPushInContext('favorite');
    } catch (e) {
      setFav(fav);
      Alert.alert(e instanceof ApiError ? e.message : tr('common:state.actionFailed'));
    }
  };
  return (
    <View
      style={[
        styles.bar,
        {
          paddingHorizontal: inPane ? 12 : gutter,
          paddingBottom: Math.max(insets.bottom, 12),
          borderColor: t.colors.border,
          backgroundColor: t.colors.background,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: fav.on }}
        accessibilityLabel={fav.on ? tr('bar.favoriteRemove') : tr('bar.favoriteAdd')}
        onPress={() => {
          selectionHaptic();
          void toggle();
        }}
        style={[styles.icon, { minHeight: t.touch, minWidth: t.touch }]}
      >
        <Icon
          ios={fav.on ? 'heart.fill' : 'heart'}
          android="favorite"
          color={fav.on ? 'destructive' : 'foreground'}
        />
        <Text variant="caption" color="muted">
          {fav.count}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('detail.share')}
        onPress={() =>
          void Share.share({
            message: tr('detail.shareMessage', { title: p.title }),
            url: `${env.webUrl}/products/${p.id}`,
          })
        }
        style={[styles.icon, { minHeight: t.touch, minWidth: t.touch }]}
      >
        <Icon ios="square.and.arrow.up" android="share" />
      </Pressable>
      {!p.isMine && p.status !== 'SOLD' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('bar.chatA11y')}
          disabled={opening}
          onPress={() => void chat()}
          style={[styles.icon, { minHeight: t.touch, minWidth: t.touch }]}
        >
          <Text variant="bodyStrong">{tr('bar.chat')}</Text>
        </Pressable>
      )}
      <View style={styles.cta}>
        <Cta p={p} />
      </View>
    </View>
  );
}

/** 넓은 화면 왼쪽 칸: 칸 크기에 맞춰 사진을 넘긴다 (정보 칸을 스크롤해도 제자리) */
function GalleryPane({ p }: { p: ProductDetailDto }) {
  const t = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View
      style={{ flex: 1, backgroundColor: t.colors.surface2 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s?.width === width && s.height === height ? s : { width, height }));
      }}
    >
      {size && <Gallery productId={p.id} images={p.images} title={p.title} size={size} />}
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { t: tr } = useTranslation(['product', 'common']);
  const { split, width } = useLayout();
  // 카드를 누를 때 미리 요청해 둔 것(lib/product-query)을 그대로 이어받는다
  const q = useQuery(productQuery(id));
  // 비슷한 작품은 id 만 있으면 되므로 작품 정보와 함께 바로 불러온다
  const related = useQuery({ queryKey: ['related', id], queryFn: () => api.market.related(id) });
  useEffect(() => {
    void api.market.recordView(id).catch(() => undefined);
  }, [id]);

  if (q.isPending) return <Loading variant="detail" />;
  const p = q.data;
  if (!p) return <Empty kind="notfound" title={tr('detail.notFound')} />;
  const price = p.auction ? p.auction.currentPrice : p.price;
  const year = p.productionYear ? tr('detail.year', { year: p.productionYear }) : null;

  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('detail.more')}
            hitSlop={10}
            onPress={() =>
              actionSheet(p.title, [
                {
                  label: tr('detail.share'),
                  onPress: () =>
                    void Share.share({
                      message: tr('detail.shareMessage', { title: p.title }),
                      url: `${env.webUrl}/products/${p.id}`,
                    }),
                },
                ...(p.isMine
                  ? []
                  : [
                      {
                        label: tr('detail.reportProduct'),
                        destructive: true,
                        onPress: () =>
                          requireLogin() &&
                          router.push({ pathname: '/report', params: { type: 'PRODUCT', id: p.id } }),
                      },
                    ]),
              ])
            }
          >
            <Icon ios="ellipsis.circle" android="more_horiz" />
          </Pressable>
        ),
      }}
    />
  );
  const info = (
    <>
      <View style={styles.head}>
        {p.blockedByMe && (
          <Text variant="small" color="muted" style={{ marginBottom: 6 }}>
            {tr('detail.blockedSeller')}
          </Text>
        )}
        <Text variant="label" color="primary">
          {p.auction
            ? tr('detail.auctionStatus', { status: label('auctionStatus', p.auction.status) })
            : label('saleType', p.saleType)}
          {p.status === 'SOLD' || p.status === 'RESERVED' ? ` · ${label('productStatus', p.status)}` : ''}
        </Text>
        {p.artist ? (
          <Link href={{ pathname: '/artists/[id]', params: { id: p.artist.id } }} accessibilityRole="link">
            <Text variant="bodyStrong">{p.artist.name}</Text>
          </Link>
        ) : (
          <Text variant="bodyStrong">{p.artistName ?? tr('detail.unknownArtist')}</Text>
        )}
        <Text variant="h1">{p.title}</Text>
        <Text variant="priceLg" style={{ marginTop: 6 }}>
          {price != null ? formatPrice(price) : tr('detail.priceOnRequest')}
          {p.auction && (
            <Text variant="small" color="muted">
              {'  '}
              {tr('detail.bidCount', { count: p.auction.bidCount })}
            </Text>
          )}
        </Text>
        {p.saleType !== 'AUCTION' && (
          <Text variant="small" color="muted">
            {tr('detail.shipping', {
              fee: p.shippingFee ? formatPrice(p.shippingFee) : tr('detail.freeShipping'),
              method: p.shippingMethod,
            })}
          </Text>
        )}
        {/* 청약철회 안내 (전자상거래법) — 경매 낙찰도 같다 */}
        {!p.isMine && (
          <Pressable
            accessibilityRole="link"
            hitSlop={6}
            onPress={() => router.push({ pathname: '/policies/[slug]', params: { slug: 'refund' } })}
            style={{ marginTop: 4 }}
          >
            <Text variant="caption" color="muted">
              {tr('detail.withdrawal')}{' '}
              <Text variant="caption" color="primary">
                {tr('detail.withdrawalLink')}
              </Text>
            </Text>
          </Pressable>
        )}
      </View>

      <Section title={tr('detail.section.info')}>
        <Spec
          label={tr('detail.spec.made')}
          value={[p.maker, p.era, year].filter(Boolean).join(' · ') || null}
        />
        <Spec label={tr('detail.spec.material')} value={p.material} />
        <Spec label={tr('detail.spec.size')} value={formatDimensions(p.widthCm, p.heightCm, p.depthCm)} />
        <Spec
          label={tr('detail.spec.condition')}
          value={`${label('condition', p.condition)}${p.conditionNote ? ` — ${p.conditionNote}` : ''}`}
        />
        <Spec label={tr('detail.spec.region')} value={p.region} />
        <Spec label={tr('detail.spec.verification')} value={label('verification', p.verificationStatus)} />
      </Section>

      {p.description ? (
        <Section title={tr('detail.section.description')}>
          <Text>{p.description}</Text>
        </Section>
      ) : null}

      {p.certificate && (
        <Section title={tr('detail.section.certificate')}>
          <Spec label={tr('detail.spec.issuer')} value={p.certificate.issuer} />
          <Spec label={tr('detail.spec.number')} value={p.certificate.number} />
          <Spec
            label={tr('detail.spec.verification')}
            value={label('verification', p.certificate.verificationStatus)}
          />
          {p.certificate.authenticityNote ? (
            <Text variant="small" color="muted">
              {p.certificate.authenticityNote}
            </Text>
          ) : null}
        </Section>
      )}

      {p.provenance.length > 0 && (
        <Section title={tr('detail.section.provenance')}>
          {p.provenance.map((v) => (
            <View key={v.id} style={{ gap: 2 }}>
              <Text variant="small" color="muted">
                {v.period}
              </Text>
              <Text variant="bodyStrong">{v.title}</Text>
              {v.description ? <Text variant="small">{v.description}</Text> : null}
            </View>
          ))}
        </Section>
      )}

      {p.returnPolicy ? (
        <Section title={tr('detail.section.returns')}>
          <Text variant="small">{p.returnPolicy}</Text>
        </Section>
      ) : null}

      <Section title={tr('detail.section.inquiries')}>
        <Inquiries productId={p.id} isMine={p.isMine} />
      </Section>

      <Section title={tr('detail.section.seller')}>
        <Link href={{ pathname: '/users/[id]', params: { id: p.seller.id } }} asChild>
          <Pressable accessibilityRole="link" style={styles.seller}>
            <Avatar avatarKey={p.seller.avatarKey} name={p.seller.nickname} size={48} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">
                {p.seller.nickname}
                {p.seller.verified ? `  ✓ ${tr('detail.verifiedSeller')}` : ''}
              </Text>
              <Text variant="small" color="muted">
                {tr('detail.sellerStats', {
                  rating: p.seller.ratingAvg.toFixed(1),
                  count: p.seller.ratingCount,
                  trades: p.seller.tradeCount,
                })}
              </Text>
            </View>
          </Pressable>
        </Link>
      </Section>

      {!!related.data?.length && <Rail title={tr('detail.section.related')} items={related.data} />}
    </>
  );

  // 넓은 화면(아이패드 가로 등): 왼쪽 사진 · 오른쪽 정보와 하단 버튼 (사진이 없으면 한 칸)
  if (split && p.images.length > 0)
    return (
      <View style={[styles.split, { backgroundColor: t.colors.background }]}>
        {header}
        <GalleryPane p={p} />
        <View
          style={{
            width: Math.min(Math.max(width * 0.4, 380), 480),
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.border,
          }}
        >
          <FormScroll
            fullWidth
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {info}
          </FormScroll>
          <BottomBar key={`${p.id}:${p.isFavorite}`} p={p} inPane />
        </View>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {header}
      <FormScroll contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 24 }}>
        {p.images.length > 0 && <Gallery productId={p.id} images={p.images} title={p.title} />}
        {info}
      </FormScroll>
      {/* 로그인하면 관심 여부가 계정 기준으로 다시 오므로 그때 하단 바 상태를 새로 맞춘다 */}
      <BottomBar key={`${p.id}:${p.isFavorite}`} p={p} />
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  head: { padding: 16, gap: 2 },
  section: { marginHorizontal: 16, paddingVertical: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  spec: { flexDirection: 'row', gap: 8 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  cta: { flex: 1 },
});
