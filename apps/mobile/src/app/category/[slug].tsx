import { SORT_LABEL, type ProductSort } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ProductGrid } from '@/components/product/product-grid';
import { Chips } from '@/components/ui/chips';
import { api } from '@/lib/api';

const SORTS: ProductSort[] = ['latest', 'popular', 'price_asc', 'price_desc', 'ending_soon'];

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [sort, setSort] = useState<ProductSort>('latest');
  const cats = useQuery({ queryKey: ['categories'], queryFn: api.market.categories, staleTime: 3_600_000 });
  const all = cats.data?.flatMap((c) => [c, ...c.children]) ?? [];
  const name = all.find((c) => c.slug === slug)?.name ?? '';
  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <ProductGrid
        params={{ category: slug, sort }}
        header={
          <Chips
            label="정렬"
            value={sort}
            onChange={setSort}
            options={SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))}
          />
        }
      />
    </>
  );
}
