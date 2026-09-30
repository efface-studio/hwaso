import type { ProductSort } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EMPTY_FILTERS, FilterButton, filterParams, type Filters } from '@/components/product/filter-sheet';
import { ProductGrid } from '@/components/product/product-grid';
import { Chips } from '@/components/ui/chips';
import { Text } from '@/components/ui/text';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { secure } from '@/lib/secure';
import { useTheme } from '@/theme';

const RECENT_KEY = 'hwaso.recentSearches';
const SORTS: ProductSort[] = ['relevance', 'latest', 'price_asc', 'price_desc', 'popular', 'ending_soon'];

/** 검색 상태: 입력 중 텍스트(text), 제출한 검색어(q), 정렬·필터, 최근 검색어 */
export function useSearch(initial = '') {
  const [text, setText] = useState(initial);
  const [q, setQ] = useState(initial);
  const [sort, setSort] = useState<ProductSort>('relevance');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [recent, setRecent] = useState<string[]>([]);
  const typing = !!text.trim() && text.trim() !== q;
  const suggest = useQuery({
    queryKey: ['suggest', text.trim()],
    queryFn: ({ signal }) => api.market.suggest(text.trim(), signal),
    enabled: typing,
  });

  useEffect(() => {
    void secure.get(RECENT_KEY).then((v) => setRecent(v ? (JSON.parse(v) as string[]) : []));
  }, []);

  /** 검색어 확정 (최근 검색어에 저장). 확정한 값을 돌려준다 */
  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return null;
    setText(v);
    setQ(v);
    const next = [v, ...recent.filter((r) => r !== v)].slice(0, 10);
    setRecent(next);
    void secure.set(RECENT_KEY, JSON.stringify(next));
    return v;
  };
  const clearRecent = () => {
    setRecent([]);
    void secure.remove(RECENT_KEY);
  };
  const reset = () => {
    setText('');
    setQ('');
  };

  return {
    text,
    setText,
    q,
    sort,
    setSort,
    filters,
    setFilters,
    recent,
    clearRecent,
    typing,
    suggest,
    submit,
    reset,
  };
}

export type SearchState = ReturnType<typeof useSearch>;

/** 검색 본문: 입력 중이면 자동완성, 검색어가 있으면 결과 그리드(정렬·필터), 아니면 최근 검색어 */
export function SearchContent({ s, onSubmit }: { s: SearchState; onSubmit: (value: string) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('home');
  if (s.typing)
    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <Pressable onPress={() => onSubmit(s.text)} style={[styles.item, { minHeight: t.touch }]}>
          <Text>{tr('search.searchFor', { query: s.text.trim() })}</Text>
        </Pressable>
        {s.suggest.data?.categories.map((c) => (
          <Pressable
            key={c.slug}
            onPress={() => router.push({ pathname: '/category/[slug]', params: { slug: c.slug } })}
            style={[styles.item, { minHeight: t.touch }]}
          >
            <Text>{c.name}</Text>
            <Text variant="caption" color="muted">
              {tr('search.kind.category')}
            </Text>
          </Pressable>
        ))}
        {s.suggest.data?.artists.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => router.push({ pathname: '/artists/[id]', params: { id: a.id } })}
            style={[styles.item, { minHeight: t.touch }]}
          >
            <Text>{a.name}</Text>
            <Text variant="caption" color="muted">
              {tr('search.kind.artist')}
            </Text>
          </Pressable>
        ))}
        {s.suggest.data?.products.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: '/products/[id]', params: { id: p.id } })}
            style={[styles.item, { minHeight: t.touch }]}
          >
            <Text numberOfLines={1} style={{ flex: 1 }}>
              {p.title}
            </Text>
            <Text variant="caption" color="muted">
              {tr('search.kind.artwork')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );

  if (s.q)
    return (
      <ProductGrid
        params={{ q: s.q, sort: s.sort, ...filterParams(s.filters) }}
        header={
          <View style={styles.tools}>
            <View style={{ flex: 1 }}>
              <Chips
                label={tr('list.sort')}
                value={s.sort}
                onChange={s.setSort}
                options={SORTS.map((o) => ({ value: o, label: label('sort', o) }))}
              />
            </View>
            <FilterButton value={s.filters} onChange={s.setFilters} />
          </View>
        }
      />
    );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 8 }}
    >
      {s.recent.length > 0 && (
        <View style={styles.recentHead}>
          <Text variant="label" color="muted">
            {tr('search.recent')}
          </Text>
          <Pressable onPress={s.clearRecent} accessibilityRole="button">
            <Text variant="label" color="muted">
              {tr('search.clearRecent')}
            </Text>
          </Pressable>
        </View>
      )}
      {s.recent.map((r) => (
        <Pressable
          key={r}
          onPress={() => onSubmit(r)}
          style={{ minHeight: t.touch, justifyContent: 'center' }}
        >
          <Text>{r}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16 },
});
