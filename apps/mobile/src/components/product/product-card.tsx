import { SALE_TYPE_LABEL, formatPrice, type ProductCardDto } from '@shop/shared';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

/** 작품 카드: 이미지는 잘리지 않게 contain, 로딩 전에는 대표색 */
export function ProductCard({ p, width }: { p: ProductCardDto; width: number }) {
  const t = useTheme();
  const price = p.auction ? p.auction.currentPrice : p.price;
  return (
    <Link href={`/products/${p.id}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${p.title}, ${price != null ? formatPrice(price) : '가격 문의'}`}
        style={{ width }}
      >
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
          <Text variant="small" numberOfLines={2}>
            {p.title}
          </Text>
          <Text variant="price">
            {price != null ? formatPrice(price) : '가격 문의'}
            {p.auction && (
              <Text variant="caption" color="live">
                {'  '}
                {SALE_TYPE_LABEL.AUCTION}
              </Text>
            )}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 4 / 5, overflow: 'hidden' },
  meta: { paddingTop: 8, gap: 2 },
});
