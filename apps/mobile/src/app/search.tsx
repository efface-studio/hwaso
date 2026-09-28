import { SORT_LABEL, type ProductSort } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { EMPTY_FILTERS, FilterButton, filterParams, type Filters } from '@/components/product/filter-sheet';
import { ProductGrid } from '@/components/product/product-grid';
import { Chips } from '@/components/ui/chips';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { secure } from '@/lib/secure';
import { useTheme } from '@/theme';

const RECENT_KEY = 'hwaso.recentSearches';
/** iOS·Android 는 OS 기본 헤더 검색창, 웹 미리보기는 헤더 검색창이 없어 입력창을 직접 그린다 */
const NATIVE_SEARCH = Platform.OS !== 'web';
const PLACEHOLDER = '작품, 작가, 시대를 검색해보세요';
const SORTS: ProductSort[] = ['relevance', 'latest', 'price_asc', 'price_desc', 'popular', 'ending_soon'];

/** 검색: 입력 중 자동완성, 제출하면 결과 그리드 (정렬·상세 필터) */
export default function SearchScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [sort, setSort] = useState<ProductSort>('relevance');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [recent, setRecent] = useState<string[]>([]);
  const searchBar = useRef<SearchBarCommands>(null);
  const typing = text.trim() && text.trim() !== q;
  const suggest = useQuery({
    queryKey: ['suggest', text.trim()],
    queryFn: ({ signal }) => api.market.suggest(text.trim(), signal),
    enabled: !!typing && text.trim().length >= 1,
  });

  useEffect(() => {
    void secure.get(RECENT_KEY).then((v) => setRecent(v ? (JSON.parse(v) as string[]) : []));
  }, []);

  // 헤더 검색창은 첫 렌더 뒤에 붙고 초기값 prop 이 없어, 붙을 때까지 몇 프레임 기다렸다 채운다
  useEffect(() => {
    const initial = params.q;
    if (!NATIVE_SEARCH || !initial) return;
    let frame = 0;
    const fill = (tries: number) => {
      if (searchBar.current) searchBar.current.setText(initial);
      else if (tries > 0) frame = requestAnimationFrame(() => fill(tries - 1));
    };
    fill(30);
    return () => cancelAnimationFrame(frame);
  }, [params.q]);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setText(v);
    setQ(v);
    // 최근 검색어를 눌렀을 때도 헤더 검색창에 보이게
    searchBar.current?.setText(v);
    searchBar.current?.blur();
    const next = [v, ...recent.filter((r) => r !== v)].slice(0, 10);
    setRecent(next);
    void secure.set(RECENT_KEY, JSON.stringify(next));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen
        options={{
          title: '검색',
          headerSearchBarOptions: NATIVE_SEARCH
            ? {
                ref: searchBar,
                placeholder: PLACEHOLDER,
                autoFocus: !params.q,
                hideWhenScrolling: false,
                onChangeText: (e) => setText(e.nativeEvent.text),
                onSearchButtonPress: (e) => submit(e.nativeEvent.text),
                onCancelButtonPress: () => setText(q),
              }
            : undefined,
        }}
      />
      {!NATIVE_SEARCH && (
        <View style={[styles.bar, { borderColor: t.colors.border }]}>
          <TextInput
            autoFocus={!params.q}
            accessibilityLabel="작품, 작가 검색"
            placeholder={PLACEHOLDER}
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
      )}
      {typing ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
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
          params={{ q, sort, ...filterParams(filters) }}
          header={
            <View style={styles.tools}>
              <View style={{ flex: 1 }}>
                <Chips
                  label="정렬"
                  value={sort}
                  onChange={setSort}
                  options={SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))}
                />
              </View>
              <FilterButton value={filters} onChange={setFilters} />
            </View>
          }
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 16, gap: 8 }}
        >
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
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16 },
});
