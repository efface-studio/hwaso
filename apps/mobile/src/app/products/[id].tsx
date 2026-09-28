import { formatPrice } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/media';
import { useTheme } from '@/theme';

/** 작품 상세 (기본 정보). 갤러리·구매·입찰은 탐색 PR 에서 확장 */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.market.product(id) });
  if (q.isPending) return <Loading />;
  if (!q.data) return <Empty title="작품을 찾을 수 없어요" />;
  const p = q.data;
  const img = p.images[0];
  const price = p.auction ? p.auction.currentPrice : p.price;
  return (
    <ScrollView style={{ backgroundColor: t.colors.background }} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: p.title }} />
      {img && (
        <View
          style={{
            width,
            height: Math.min(width * (img.height / img.width), width * 1.3),
            backgroundColor: img.dominantColor,
          }}
        >
          <Image
            source={mediaUrl(img.key, 1600)}
            style={{ flex: 1 }}
            contentFit="contain"
            accessibilityLabel={p.title}
          />
        </View>
      )}
      <View style={{ padding: 16, gap: 6 }}>
        <Text variant="bodyStrong">{p.artistName ?? '작자 미상'}</Text>
        <Text variant="h1">{p.title}</Text>
        <Text variant="priceLg">{price != null ? formatPrice(price) : '가격 문의'}</Text>
        <Text color="muted" style={{ marginTop: 12 }}>
          {p.description}
        </Text>
      </View>
    </ScrollView>
  );
}
