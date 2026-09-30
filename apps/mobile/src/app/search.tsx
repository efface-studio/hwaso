import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { SearchContent, useSearch } from '@/components/search/search-content';
import { useTheme } from '@/theme';

/** iOS·Android 는 OS 기본 헤더 검색창, 웹 미리보기는 헤더 검색창이 없어 입력창을 직접 그린다 */
const NATIVE_SEARCH = Platform.OS !== 'web';

/** 검색 화면 (홈 밖에서 여는 경우 — 홈은 헤더에서 그 자리에서 검색한다): 입력 중 자동완성, 제출하면 결과 그리드 */
export default function SearchScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['home', 'common']);
  const params = useLocalSearchParams<{ q?: string }>();
  const s = useSearch(params.q ?? '');
  const searchBar = useRef<SearchBarCommands>(null);

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
    const v = s.submit(value);
    if (!v) return;
    // 최근 검색어를 눌렀을 때도 헤더 검색창에 보이게
    searchBar.current?.setText(v);
    searchBar.current?.blur();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen
        options={{
          title: tr('common:screen.search'),
          headerSearchBarOptions: NATIVE_SEARCH
            ? {
                ref: searchBar,
                placeholder: tr('search.placeholder'),
                autoFocus: !params.q,
                hideWhenScrolling: false,
                onChangeText: (e) => s.setText(e.nativeEvent.text),
                onSearchButtonPress: (e) => submit(e.nativeEvent.text),
                onCancelButtonPress: () => s.setText(s.q),
              }
            : undefined,
        }}
      />
      {!NATIVE_SEARCH && (
        <View style={[styles.bar, { borderColor: t.colors.border }]}>
          <TextInput
            autoFocus={!params.q}
            accessibilityLabel={tr('search.inputA11y')}
            placeholder={tr('search.placeholder')}
            placeholderTextColor={t.colors.faint}
            returnKeyType="search"
            value={s.text}
            onChangeText={s.setText}
            onSubmitEditing={() => submit(s.text)}
            style={[
              t.inputType(),
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
      <SearchContent s={s} onSubmit={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { paddingHorizontal: 14 },
});
