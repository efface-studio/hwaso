import type { ProductCardDto } from '@shop/shared';
import { FlatList, StyleSheet, View } from 'react-native';
import { ProductCard } from '@/components/product/product-card';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const PADDING = 16;
const GAP = 12;

/**
 * 홈 가로 목록 한 줄. 홈은 이런 줄이 여러 개라, 처음에는 화면에 보이는 몇 장만 그리고
 * 카드 폭이 고정이라 위치를 계산해(getItemLayout) 재지 않고 넘긴다.
 */
export function Rail({ title, items }: { title: string; items: ProductCardDto[] }) {
  const t = useTheme();
  if (!items.length) return null;
  const width = t.senior ? 168 : 140;
  return (
    <View style={styles.section}>
      <Text variant="h3" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProductCard p={item} width={width} />}
        getItemLayout={(_, index) => ({ length: width, offset: PADDING + index * (width + GAP), index })}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        contentContainerStyle={styles.list}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 24 },
  title: { paddingHorizontal: 16, marginBottom: 12 },
  list: { paddingHorizontal: PADDING, gap: GAP },
});
