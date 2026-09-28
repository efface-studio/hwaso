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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rail } from '@/components/home/rail';
import { Button } from '@/components/ui/button';
import { Gallery } from '@/components/product/gallery';
import { Avatar } from '@/components/ui/avatar';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
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

/** 하단 고정 바: 관심 · 공유 (구매·입찰·채팅 버튼은 해당 기능 화면과 함께 붙는다) */
function BottomBar({ p }: { p: ProductDetailDto }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [fav, setFav] = useState({ on: p.isFavorite, count: p.favoriteCount });
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
        onPress={() => void toggle()}
        style={[styles.icon, { minHeight: t.touch, minWidth: t.touch }]}
      >
        <Text variant="h3" color={fav.on ? 'destructive' : 'foreground'}>
          {fav.on ? '♥' : '♡'}
        </Text>
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
        <Text variant="bodyStrong">공유</Text>
      </Pressable>
      {p.auction &&
        (p.auction.status === 'LIVE' || p.auction.status === 'SCHEDULED' || p.auction.status === 'ENDED') && (
          <Button
            title={
              p.auction.status === 'LIVE'
                ? '경매 참여하기'
                : p.auction.status === 'SCHEDULED'
                  ? '경매 예정 보기'
                  : '경매 결과 보기'
            }
            size="lg"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/auctions/[id]', params: { id: p.auction!.id } })}
          />
        )}
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
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
      <Stack.Screen options={{ title: '' }} />
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
});
