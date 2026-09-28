import { SALE_TYPE_LABEL, SORT_LABEL, type ProductSort, type SaleType } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ProductGrid } from '@/components/product/product-grid';
import { Chips } from '@/components/ui/chips';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { secure } from '@/lib/secure';
import { useTheme } from '@/theme';

const RECENT_KEY = 'hwaso.recentSearches';
const SORTS: ProductSort[] = ['relevance', 'latest', 'price_asc', 'price_desc', 'popular', 'ending_soon'];
type TypeFilter = 'all' | SaleType;

/** 검색: 입력 중 자동완성, 제출하면 결과 그리드 (정렬·판매 방식) */
export default function SearchScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [sort, setSort] = useState<ProductSort>('relevance');
  const [type, setType] = useState<TypeFilter>('all');
  const [recent, setRecent] = useState<string[]>([]);
  const typing = text.trim() && text.trim() !== q;
  const suggest = useQuery({
    queryKey: ['suggest', text.trim()],
    queryFn: ({ signal }) => api.market.suggest(text.trim(), signal),
    enabled: !!typing && text.trim().length >= 1,
  });

  useEffect(() => {
    void secure.get(RECENT_KEY).then((v) => setRecent(v ? (JSON.parse(v) as string[]) : []));
  }, []);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setText(v);
    setQ(v);
    const next = [v, ...recent.filter((r) => r !== v)].slice(0, 10);
    setRecent(next);
    void secure.set(RECENT_KEY, JSON.stringify(next));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ title: '검색' }} />
      <View style={[styles.bar, { borderColor: t.colors.border }]}>
        <TextInput
          autoFocus={!params.q}
          accessibilityLabel="작품, 작가 검색"
          placeholder="작품, 작가, 시대를 검색해보세요"
          placeholderTextColor={t.colors.faint}
          returnKeyType="search"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submit(text)}
          style={[
            t.type('body'),
            styles.input,
            {
              color: t.colors.foreground,
              backgroundColor: t.colors.surface2,
              minHeight: t.controlHeight,
              borderRadius: t.radius.md,
            },
          ]}
        />
      </View>
      {typing ? (
        <ScrollView keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => submit(text)} style={[styles.item, { minHeight: t.touch }]}>
            <Text>‘{text.trim()}’ 검색</Text>
          </Pressable>
          {suggest.data?.categories.map((c) => (
            <Pressable
              key={c.slug}
              onPress={() => router.push({ pathname: '/category/[slug]', params: { slug: c.slug } })}
              style={[styles.item, { minHeight: t.touch }]}
            >
              <Text>{c.name}</Text>
              <Text variant="caption" color="muted">
                카테고리
              </Text>
            </Pressable>
          ))}
          {suggest.data?.artists.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => router.push({ pathname: '/artists/[id]', params: { id: a.id } })}
              style={[styles.item, { minHeight: t.touch }]}
            >
              <Text>{a.name}</Text>
              <Text variant="caption" color="muted">
                작가
              </Text>
            </Pressable>
          ))}
          {suggest.data?.products.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: '/products/[id]', params: { id: p.id } })}
              style={[styles.item, { minHeight: t.touch }]}
            >
              <Text numberOfLines={1} style={{ flex: 1 }}>
                {p.title}
              </Text>
              <Text variant="caption" color="muted">
                작품
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : q ? (
        <ProductGrid
          params={{ q, sort, saleType: type === 'all' ? undefined : type }}
          header={
            <View>
              <Chips
                label="정렬"
                value={sort}
                onChange={setSort}
                options={SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))}
              />
              <Chips
                label="판매 방식"
                value={type}
                onChange={setType}
                options={[
                  { value: 'all' as TypeFilter, label: '전체' },
                  ...(['FIXED', 'AUCTION', 'RESERVATION'] as SaleType[]).map((s) => ({
                    value: s as TypeFilter,
                    label: SALE_TYPE_LABEL[s],
                  })),
                ]}
              />
            </View>
          }
        />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 8 }}>
          {recent.length > 0 && (
            <View style={styles.recentHead}>
              <Text variant="label" color="muted">
                최근 검색어
              </Text>
              <Pressable
                onPress={() => {
                  setRecent([]);
                  void secure.remove(RECENT_KEY);
                }}
                accessibilityRole="button"
              >
                <Text variant="label" color="muted">
                  모두 지우기
                </Text>
              </Pressable>
            </View>
          )}
          {recent.map((r) => (
            <Pressable
              key={r}
              onPress={() => submit(r)}
              style={{ minHeight: t.touch, justifyContent: 'center' }}
            >
              <Text>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { paddingHorizontal: 14 },
  item: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between' },
});
