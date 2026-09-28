import type { ProductCardDto } from '@shop/shared';
import type { ReactElement } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { Loading } from '@/components/ui/state';
import { useGrid } from '@/hooks/use-grid';
import { useTheme } from '@/theme';
import { ProductCard } from './product-card';

/** 페이지 없는 작품 목록 그리드 (관심·최근 본 작품) */
export function CardList({
  items,
  loading,
  refreshing,
  onRefresh,
  empty,
  header,
}: {
  items: ProductCardDto[] | undefined;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  empty: ReactElement;
  header?: ReactElement;
}) {
  const t = useTheme();
  const g = useGrid();
  if (loading) return <Loading />;
  return (
    <FlatList
      key={g.columns}
      data={items ?? []}
      numColumns={g.columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={g.cardWidth} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      columnWrapperStyle={g.columns > 1 ? { gap: g.gap, paddingHorizontal: g.padding } : undefined}
      contentContainerStyle={{ gap: 20, paddingTop: 12, paddingBottom: 32 }}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  );
}
