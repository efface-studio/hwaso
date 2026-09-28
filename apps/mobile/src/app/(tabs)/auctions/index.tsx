import { useQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl, useWindowDimensions } from 'react-native';
import { ProductCard } from '@/components/product/product-card';
import { Empty, Loading } from '@/components/ui/state';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 진행 중 경매 (그리드). 태블릿에서는 열이 늘어난다 */
export default function AuctionsScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 1024 ? 4 : width >= 700 ? 3 : 2;
  const cardWidth = (width - 16 * 2 - 12 * (columns - 1)) / columns;
  const q = useQuery({
    queryKey: ['auctions', 'live'],
    queryFn: () => api.auctions.list({ status: 'live', limit: 48 }),
  });
  if (q.isPending) return <Loading />;
  if (!q.data?.items.length) return <Empty title="진행 중인 경매가 없어요" />;
  return (
    <FlatList
      key={columns}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t.colors.background }}
      data={q.data.items}
      numColumns={columns}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={cardWidth} />}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ padding: 16, gap: 20 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    />
  );
}
