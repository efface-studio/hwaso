import type { ProductCardDto } from '@shop/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type ListRenderItemInfo } from 'react-native';
import { MediaImage } from '@/components/ui/media-image';
import { Text } from '@/components/ui/text';
import { formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { prefetchCover, prefetchProduct } from '@/lib/product-query';
import { useTheme } from '@/theme';

/**
 * 작품 카드: 이미지는 잘리지 않게 contain, 로딩 전에는 대표색. 이미지는 카드 폭에 맞는 파생본을 받는다.
 * 목록을 다시 불러와도 바뀌지 않은 작품(React Query 가 같은 객체를 유지)은 다시 그리지 않는다.
 * 누르기 시작하면 상세 정보를, 누르면 상세 첫 사진을 미리 받는다.
 */
export const ProductCard = memo(function ProductCard({ p, width }: { p: ProductCardDto; width: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation('home');
  const qc = useQueryClient();
  const price = p.auction ? p.auction.currentPrice : p.price;
  const priceText = price != null ? formatPrice(price) : tr('card.priceOnRequest');
  return (
    <Link
      href={{ pathname: '/products/[id]', params: { id: p.id } }}
      onPress={() => p.image && prefetchCover(p.image.key)}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${p.title}, ${priceText}`}
        onPressIn={() => prefetchProduct(qc, p.id)}
        style={{ width }}
      >
        <View style={[styles.frame, { backgroundColor: p.image?.dominantColor ?? t.colors.surface2 }]}>
          {p.image && (
            <MediaImage
              mediaKey={p.image.key}
              displayWidth={width}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              transition={t.senior ? 0 : 150}
              recyclingKey={p.id}
            />
          )}
        </View>
        <View style={styles.meta}>
          {p.artistName && (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {p.artistName}
            </Text>
          )}
          <Text variant="small" numberOfLines={1}>
            {p.title}
          </Text>
          <Text variant="price">
            {priceText}
            {p.auction && (
              <Text variant="caption" color="live">
                {'  '}
                {label('saleType', 'AUCTION')}
              </Text>
            )}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
});

/** 카드 목록의 renderItem — 카드 폭이 그대로면 같은 함수를 돌려줘 목록이 칸을 다시 그리지 않게 한다 */
export function useCardRenderer(width: number) {
  return useCallback(
    ({ item }: ListRenderItemInfo<ProductCardDto>) => <ProductCard p={item} width={width} />,
    [width],
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 4 / 5, overflow: 'hidden' },
  meta: { paddingTop: 8, gap: 2 },
});
