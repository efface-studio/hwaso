import type { ProductCardDto } from '@shop/shared';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

/**
 * 작품 카드: 이미지는 잘리지 않게 contain, 로딩 전에는 대표색.
 * 목록을 다시 불러와도 바뀌지 않은 작품(React Query 가 같은 객체를 유지)은 다시 그리지 않는다.
 */
export const ProductCard = memo(function ProductCard({ p, width }: { p: ProductCardDto; width: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation('home');
  const price = p.auction ? p.auction.currentPrice : p.price;
  const priceText = price != null ? formatPrice(price) : tr('card.priceOnRequest');
  return (
    <Link href={{ pathname: '/products/[id]', params: { id: p.id } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${p.title}, ${priceText}`} style={{ width }}>
        <View style={[styles.frame, { backgroundColor: p.image?.dominantColor ?? t.colors.surface2 }]}>
          {p.image && (
            <Image
              source={mediaUrl(p.image.key, 400)}
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

const styles = StyleSheet.create({
  frame: { aspectRatio: 4 / 5, overflow: 'hidden' },
  meta: { paddingTop: 8, gap: 2 },
});
