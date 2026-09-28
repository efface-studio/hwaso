import type { ProductCardDto } from '@shop/shared';
import { FlatList, StyleSheet, View } from 'react-native';
import { ProductCard } from '@/components/product/product-card';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** 홈 가로 목록 한 줄 */
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
        contentContainerStyle={styles.list}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 24 },
  title: { paddingHorizontal: 16, marginBottom: 12 },
  list: { paddingHorizontal: 16, gap: 12 },
});
