import { ApiError } from '@shop/api-client';
import type { Paged } from '@shop/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, type NativeStackHeaderItem } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { RowSeparator } from '@/components/admin/row';
import { AppRefreshControl } from '@/components/ui/app-refresh-control';
import { Empty, Loading, type LoadingVariant } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

export type AdminQuery = Record<string, string | number | undefined>;

export type AdminFilter = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** 처음 고른 값 ('all' 이면 전체) */
  initial?: string;
};

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

/** 관리자 처리 요청: 성공하면 안내하고 관련 목록(['admin', key])을 다시 불러온다 */
export function useAdminAction<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>,
  successMsg: string | null,
  invalidate: string[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => {
      if (successMsg) Alert.alert(successMsg);
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: ['admin', k] });
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : '처리하지 못했습니다.'),
  });
}

/** 입력이 멈춘 뒤에만 검색어를 반영한다 (글자마다 요청하지 않게) */
function useDebouncedSearch() {
  const [q, setQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    q,
    type: (text: string) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setQ(text.trim()), SEARCH_DEBOUNCE_MS);
    },
    submit: (text: string) => {
      clearTimeout(timer.current);
      setQ(text.trim());
    },
  };
}

/**
 * 관리자 목록: 헤더 검색창 · 헤더 필터 메뉴 · 총 건수 · 페이지 단위 무한 스크롤 · 당겨서 새로고침(스켈레톤).
 * 검색과 필터는 목록 위에 쌓지 않고 내비게이션 바의 기본 컨트롤로 둔다.
 * API 는 페이지 번호 방식(Paged: items·total·page·size)이라 다음 페이지가 있으면 이어 붙인다.
 */
export function AdminList<T extends { id: string }>({
  queryKey,
  fetcher,
  filters = [],
  searchPlaceholder,
  renderItem,
  header,
  footer,
  skeleton = 'plain-list',
  emptyTitle = '결과가 없어요.',
  extraData,
  separatorInset = 16,
  headerItems = [],
}: {
  queryKey: string;
  fetcher: (q: AdminQuery) => Promise<Paged<T>>;
  filters?: AdminFilter[];
  /** 있으면 헤더에 검색창을 단다 */
  searchPlaceholder?: string;
  renderItem: (item: T) => ReactElement;
  /** 목록 맨 위 (보기 전환 세그먼트 등) */
  header?: ReactNode;
  /** 건수 줄 아래·목록 위 (일괄 처리 도구 등) */
  footer?: ReactNode;
  skeleton?: LoadingVariant;
  emptyTitle?: string;
  extraData?: unknown;
  /** 행 구분선 들여쓰기 (썸네일이 있으면 글자 시작점까지) */
  separatorInset?: number;
  /** 필터 메뉴 앞에 붙일 헤더 버튼 (선택한 항목 일괄 처리 등 — 스크롤과 상관없이 늘 보인다) */
  headerItems?: NativeStackHeaderItem[];
}) {
  const t = useTheme();
  const search = useDebouncedSearch();
  const initialValues = () => Object.fromEntries(filters.map((f) => [f.key, f.initial ?? 'all']));
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const params: AdminQuery = {
    q: search.q || undefined,
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === 'all' ? undefined : v])),
  };
  const list = useInfiniteQuery({
    queryKey: ['admin', queryKey, params],
    queryFn: ({ pageParam }) => fetcher({ ...params, page: pageParam, size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.size < last.total ? last.page + 1 : undefined),
  });
  const pull = usePullRefresh(list.refetch);
  // 구분선 컴포넌트는 들여쓰기가 바뀔 때만 새로 만든다 (렌더마다 새로 만들면 매번 다시 마운트된다)
  const Separator = useMemo(
    () =>
      function Separator() {
        return <RowSeparator inset={separatorInset} />;
      },
    [separatorInset],
  );
  const items = pull.refreshing ? [] : (list.data?.pages.flatMap((p) => p.items) ?? []);
  const total = list.data?.pages[0]?.total;

  const pick = (key: string, v: string) => {
    selectionHaptic();
    setValues((prev) => ({ ...prev, [key]: v }));
  };
  const reset = () => setValues(Object.fromEntries(filters.map((f) => [f.key, 'all'])));
  const active = filters.flatMap((f) => {
    const opt = f.options.find((o) => o.value === values[f.key]);
    return opt ? [opt.label] : [];
  });

  const filterMenu: NativeStackHeaderItem[] = filters.length
    ? [
        {
          type: 'menu',
          label: active.length ? `필터 ${active.length}개 적용됨` : '필터',
          icon: {
            type: 'sfSymbol',
            name: active.length
              ? 'line.3.horizontal.decrease.circle.fill'
              : 'line.3.horizontal.decrease.circle',
          },
          menu: {
            items: [
              ...filters.map((f) => ({
                type: 'submenu' as const,
                label: f.label,
                inline: true,
                // 메뉴 항목은 이름으로 구분되므로 '전체'에도 필터 이름을 붙인다
                items: [{ value: 'all', label: `${f.label} 전체` }, ...f.options].map((o) => ({
                  type: 'action' as const,
                  label: o.label,
                  state: (values[f.key] ?? 'all') === o.value ? ('on' as const) : ('off' as const),
                  onPress: () => pick(f.key, o.value),
                })),
              })),
              ...(active.length ? [{ type: 'action' as const, label: '필터 초기화', onPress: reset }] : []),
            ],
          },
        },
      ]
    : [];
  const rightItems = [...headerItems, ...filterMenu];

  return (
    <>
      <Stack.Screen
        options={{
          // 쓰지 않는 옵션은 키째 빼서 화면이 따로 단 헤더 설정을 덮어쓰지 않게 한다
          ...(searchPlaceholder && {
            headerSearchBarOptions: {
              placement: 'integratedButton',
              allowToolbarIntegration: false,
              hideWhenScrolling: false,
              placeholder: searchPlaceholder,
              autoCapitalize: 'none',
              onChangeText: (e) => search.type(e.nativeEvent.text),
              onSearchButtonPress: (e) => search.submit(e.nativeEvent.text),
              onCancelButtonPress: () => search.submit(''),
            },
          }),
          ...(rightItems.length > 0 && { unstable_headerRightItems: () => rightItems }),
        }}
      />
      <List
        style={{ backgroundColor: t.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={items}
        extraData={extraData}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => renderItem(item)}
        ItemSeparatorComponent={Separator}
        initialNumToRender={12}
        windowSize={11}
        ListHeaderComponent={
          <View>
            {header && <View style={styles.header}>{header}</View>}
            {total !== undefined && !pull.refreshing && (
              <View style={styles.summary}>
                <Text variant="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {[`${total.toLocaleString('ko-KR')}건`, ...active].join(' · ')}
                </Text>
                {active.length > 0 && (
                  <Pressable accessibilityRole="button" hitSlop={10} onPress={reset}>
                    <Text variant="caption" color="primary">
                      필터 해제
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {footer}
          </View>
        }
        ListEmptyComponent={
          list.isPending || pull.refreshing ? (
            <Loading variant={skeleton} />
          ) : (
            <Empty
              kind={list.error ? 'error' : 'search'}
              title={list.error ? '불러오지 못했어요' : emptyTitle}
              action={
                list.error
                  ? { title: '다시 시도', onPress: () => void list.refetch() }
                  : active.length
                    ? { title: '필터 해제', onPress: reset }
                    : undefined
              }
            />
          )
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator color={t.colors.primary} style={{ margin: 16 }} />
          ) : null
        }
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        refreshControl={<AppRefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
});
