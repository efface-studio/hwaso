import { ApiError } from '@shop/api-client';
import {
  AUCTION_STATUS_LABEL,
  CONDITION_LABEL,
  SALE_TYPE_LABEL,
  VERIFICATION_LABEL,
  formatDimensions,
  formatPrice,
  type ProductDetailDto,
} from '@shop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rail } from '@/components/home/rail';
import { Button } from '@/components/ui/button';
import { Gallery } from '@/components/product/gallery';
import { Inquiries } from '@/components/product/inquiries';
import { Avatar } from '@/components/ui/avatar';
import { Empty, Loading } from '@/components/ui/state';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { actionSheet } from '@/lib/action-sheet';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { selectionHaptic } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth';
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
  new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 판매 방식별 CTA (웹 PurchasePanel 과 같은 규칙). 가격·경매 상태는 서버 값만 쓴다 */
function Cta({ p }: { p: ProductDetailDto }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const add = useMutation({
    mutationFn: () => api.orders.putCart(p.id, 1),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      Alert.alert('장바구니에 담았어요', undefined, [
        { text: '계속 둘러보기', style: 'cancel' },
        { text: '장바구니 보기', onPress: () => router.push('/cart') },
      ]);
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : '담지 못했어요.'),
  });
  const disabled = (title: string) => <Button title={title} size="lg" disabled block />;
  if (p.isMine)
    return (
      <Button
        title="내 작품 관리"
        variant="outline"
        size="lg"
        block
        onPress={() => router.push({ pathname: '/sell/[id]/edit', params: { id: p.id } })}
      />
    );
  if (p.status === 'SOLD') return disabled('판매 완료');
  if (p.status === 'RESERVED') return disabled('거래 진행 중');
  if (p.saleType === 'AUCTION' && p.auction) {
    const a = p.auction;
    return (
      <Button
        title={
          a.status === 'LIVE'
            ? '경매 참여하기'
            : a.status === 'SCHEDULED'
              ? '경매 보러가기'
              : '경매 결과 보기'
        }
        size="lg"
        block
        onPress={() => router.push({ pathname: '/auctions/[id]', params: { id: a.id } })}
      />
    );
  }
  if (p.saleType === 'RESERVATION' && p.availableAt && Date.parse(p.availableAt) > Date.now())
    return disabled(`${when(p.availableAt)} 판매 시작`);
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button
        title="장바구니"
        variant="outline"
        size="lg"
        loading={add.isPending}
        onPress={() => (user ? add.mutate() : router.push('/login'))}
      />
      <Button
        title="구매하기"
        size="lg"
        style={{ flex: 1 }}
        onPress={() =>
          user ? router.push({ pathname: '/checkout', params: { productId: p.id } }) : router.push('/login')
        }
      />
    </View>
  );
}

/** 하단 고정 바: 관심 · 공유 · 채팅 + 판매 방식별 CTA */
function BottomBar({ p }: { p: ProductDetailDto }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [fav, setFav] = useState({ on: p.isFavorite, count: p.favoriteCount });
  const [opening, setOpening] = useState(false);
  const chat = async () => {
    if (!user) return router.push('/login');
    setOpening(true);
    try {
      const { id } = await api.chat.open(p.id);
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '채팅을 열지 못했어요.');
    } finally {
      setOpening(false);
    }
  };
  const toggle = async () => {
    if (!user) return router.push('/login');
    const next = { on: !fav.on, count: fav.count + (fav.on ? -1 : 1) };
    setFav(next);
    try {
      await (next.on ? api.market.favorite(p.id) : api.market.unfavorite(p.id));
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    } catch (e) {
      setFav(fav);
      Alert.alert(e instanceof ApiError ? e.message : '처리하지 못했어요.');
    }
  };
  return (
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
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: fav.on }}
        accessibilityLabel={fav.on ? '관심 해제' : '관심 작품에 추가'}
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
        accessibilityLabel="공유하기"
        onPress={() =>
          void Share.share({ message: `${p.title} · 화소`, url: `${env.webUrl}/products/${p.id}` })
        }
        style={[styles.icon, { minHeight: t.touch, minWidth: t.touch }]}
      >
        <Icon ios="square.and.arrow.up" android="share" />
      </Pressable>
      {!p.isMine && p.status !== 'SOLD' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="판매자와 채팅하기"
          disabled={opening}
          onPress={() => void chat()}
          style={[styles.icon, { minHeight: t.touch, minWidth: t.touch }]}
        >
          <Text variant="bodyStrong">채팅</Text>
        </Pressable>
      )}
      <View style={styles.cta}>
        <Cta p={p} />
      </View>
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.market.product(id) });
  const related = useQuery({
    queryKey: ['related', id],
    queryFn: () => api.market.related(id),
    enabled: !!q.data,
  });
  useEffect(() => {
    void api.market.recordView(id).catch(() => undefined);
  }, [id]);

  if (q.isPending) return <Loading />;
  const p = q.data;
  if (!p) return <Empty title="작품을 찾을 수 없어요" />;
  const price = p.auction ? p.auction.currentPrice : p.price;
  const year = p.productionYear ? `${p.productionYear}년` : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="더보기"
              hitSlop={10}
              onPress={() =>
                actionSheet(p.title, [
                  {
                    label: '공유하기',
                    onPress: () =>
                      void Share.share({
                        message: `${p.title} · 화소`,
                        url: `${env.webUrl}/products/${p.id}`,
                      }),
                  },
                  ...(p.isMine
                    ? []
                    : [
                        {
                          label: '작품 신고',
                          destructive: true,
                          onPress: () =>
                            user
                              ? router.push({ pathname: '/report', params: { type: 'PRODUCT', id: p.id } })
                              : router.push('/login'),
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
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 24 }}>
        {p.images.length > 0 && <Gallery productId={p.id} images={p.images} title={p.title} />}
        <View style={styles.head}>
          <Text variant="label" color="primary">
            {p.auction ? `경매 · ${AUCTION_STATUS_LABEL[p.auction.status]}` : SALE_TYPE_LABEL[p.saleType]}
            {p.status === 'SOLD' ? ' · 판매 완료' : p.status === 'RESERVED' ? ' · 거래 중' : ''}
          </Text>
          {p.artist ? (
            <Link href={{ pathname: '/artists/[id]', params: { id: p.artist.id } }} accessibilityRole="link">
              <Text variant="bodyStrong">{p.artist.name}</Text>
            </Link>
          ) : (
            <Text variant="bodyStrong">{p.artistName ?? '작자 미상'}</Text>
          )}
          <Text variant="h1">{p.title}</Text>
          <Text variant="priceLg" style={{ marginTop: 6 }}>
            {price != null ? formatPrice(price) : '가격 문의'}
            {p.auction && (
              <Text variant="small" color="muted">
                {'  '}입찰 {p.auction.bidCount}회
              </Text>
            )}
          </Text>
          {p.saleType !== 'AUCTION' && (
            <Text variant="small" color="muted">
              배송비 {p.shippingFee ? formatPrice(p.shippingFee) : '무료'} · {p.shippingMethod}
            </Text>
          )}
        </View>

        <Section title="작품 정보">
          <Spec label="제작" value={[p.maker, p.era, year].filter(Boolean).join(' · ') || null} />
          <Spec label="재료" value={p.material} />
          <Spec label="크기" value={formatDimensions(p.widthCm, p.heightCm, p.depthCm)} />
          <Spec
            label="상태"
            value={`${CONDITION_LABEL[p.condition]}${p.conditionNote ? ` — ${p.conditionNote}` : ''}`}
          />
          <Spec label="지역" value={p.region} />
          <Spec label="검수" value={VERIFICATION_LABEL[p.verificationStatus]} />
        </Section>

        {p.description ? (
          <Section title="설명">
            <Text>{p.description}</Text>
          </Section>
        ) : null}

        {p.certificate && (
          <Section title="감정서 · 보증서">
            <Spec label="발행처" value={p.certificate.issuer} />
            <Spec label="번호" value={p.certificate.number} />
            <Spec label="검수" value={VERIFICATION_LABEL[p.certificate.verificationStatus]} />
            {p.certificate.authenticityNote ? (
              <Text variant="small" color="muted">
                {p.certificate.authenticityNote}
              </Text>
            ) : null}
          </Section>
        )}

        {p.provenance.length > 0 && (
          <Section title="소장 이력">
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
          <Section title="교환 · 환불">
            <Text variant="small">{p.returnPolicy}</Text>
          </Section>
        ) : null}

        <Section title="상품 문의">
          <Inquiries productId={p.id} isMine={p.isMine} />
        </Section>

        <Section title="판매자">
          <Link href={{ pathname: '/users/[id]', params: { id: p.seller.id } }} asChild>
            <Pressable accessibilityRole="link" style={styles.seller}>
              <Avatar avatarKey={p.seller.avatarKey} name={p.seller.nickname} size={48} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">
                  {p.seller.nickname}
                  {p.seller.verified ? '  ✓ 인증 판매자' : ''}
                </Text>
                <Text variant="small" color="muted">
                  평점 {p.seller.ratingAvg.toFixed(1)} ({p.seller.ratingCount}) · 거래 {p.seller.tradeCount}회
                </Text>
              </View>
            </Pressable>
          </Link>
        </Section>

        {!!related.data?.length && <Rail title="비슷한 작품" items={related.data} />}
      </ScrollView>
      <BottomBar key={p.id} p={p} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { padding: 16, gap: 2 },
  section: { marginHorizontal: 16, paddingVertical: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  spec: { flexDirection: 'row', gap: 8 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  cta: { flex: 1 },
});
