import {
  CONDITION_LABEL,
  ITEM_CONDITIONS,
  SALE_TYPE_LABEL,
  SALE_TYPES,
  type ItemCondition,
  type SaleType,
} from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { PriceField } from '@/components/ui/inputs';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** 목록 필터 (서버 productListQuery 와 같은 이름 — 여러 값은 쉼표로 보낸다) */
export interface Filters {
  saleType: SaleType[];
  minPrice: number | null;
  maxPrice: number | null;
  condition: ItemCondition[];
  era: string[];
  material: string[];
  region: string[];
  verifiedOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  saleType: [],
  minPrice: null,
  maxPrice: null,
  condition: [],
  era: [],
  material: [],
  region: [],
  verifiedOnly: false,
};

const csv = (v: string[]) => (v.length ? v.join(',') : undefined);

/** Filters → 목록 API 파라미터 */
export const filterParams = (f: Filters) => ({
  saleType: csv(f.saleType),
  minPrice: f.minPrice ?? undefined,
  maxPrice: f.maxPrice ?? undefined,
  condition: csv(f.condition),
  era: csv(f.era),
  material: csv(f.material),
  region: csv(f.region),
  verifiedOnly: f.verifiedOnly || undefined,
});

export const countFilters = (f: Filters) =>
  f.saleType.length +
  f.condition.length +
  f.era.length +
  f.material.length +
  f.region.length +
  (f.minPrice != null || f.maxPrice != null ? 1 : 0) +
  (f.verifiedOnly ? 1 : 0);

const MAX_FACETS = 12;
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function MultiChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  const t = useTheme();
  if (!options.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{label}</Text>
      <View style={styles.wrap}>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <Pressable
              key={o.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(toggle(value, o.value))}
              style={[
                styles.chip,
                {
                  minHeight: t.touch - 8,
                  borderColor: on ? t.colors.foreground : t.colors.border,
                  backgroundColor: on ? t.colors.foreground : 'transparent',
                },
              ]}
            >
              <Text variant="small" color={on ? 'background' : 'foreground'}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 필터 버튼 + 시트. 시트 안에서 고른 값은 "적용" 할 때만 반영한다 */
export function FilterButton({
  value,
  onChange,
  category,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  category?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const facets = useQuery({
    queryKey: ['facets', category ?? 'all'],
    queryFn: () => api.market.facets(category),
    enabled: open,
    staleTime: 600_000,
  });
  const n = countFilters(value);
  const set = (p: Partial<Filters>) => setDraft((d) => ({ ...d, ...p }));
  const facet = (list: { value: string; count: number }[] | undefined) =>
    (list ?? []).slice(0, MAX_FACETS).map((x) => ({ value: x.value, label: `${x.value} ${x.count}` }));
  const range = facets.data?.priceRange;

  return (
    <>
      <Button
        title={n ? `필터 ${n}` : '필터'}
        size="sm"
        variant={n ? 'secondary' : 'outline'}
        accessibilityLabel={n ? `필터 ${n}개 적용됨` : '필터'}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: t.colors.background }}>
          <View style={styles.head}>
            <Text variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
              필터
            </Text>
            <Button title="닫기" variant="ghost" size="sm" onPress={() => setOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <MultiChips
              label="판매 방식"
              value={draft.saleType}
              onChange={(saleType) => set({ saleType })}
              options={SALE_TYPES.map((s) => ({ value: s, label: SALE_TYPE_LABEL[s] }))}
            />
            <View style={{ gap: 8 }}>
              <Text variant="label">
                가격
                {range
                  ? `  (${range.min.toLocaleString('ko-KR')}~${range.max.toLocaleString('ko-KR')}원)`
                  : ''}
              </Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <PriceField
                    label="최저"
                    value={draft.minPrice}
                    onChange={(minPrice) => set({ minPrice })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <PriceField
                    label="최고"
                    value={draft.maxPrice}
                    onChange={(maxPrice) => set({ maxPrice })}
                  />
                </View>
              </View>
            </View>
            <MultiChips
              label="상태"
              value={draft.condition}
              onChange={(condition) => set({ condition })}
              options={ITEM_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))}
            />
            <MultiChips
              label="시대"
              value={draft.era}
              onChange={(era) => set({ era })}
              options={facet(facets.data?.eras)}
            />
            <MultiChips
              label="소재"
              value={draft.material}
              onChange={(material) => set({ material })}
              options={facet(facets.data?.materials)}
            />
            <MultiChips
              label="거래 지역"
              value={draft.region}
              onChange={(region) => set({ region })}
              options={facet(facets.data?.regions)}
            />
            <View style={styles.row}>
              <Text style={{ flex: 1 }}>검수 완료 작품만</Text>
              <Switch
                value={draft.verifiedOnly}
                onValueChange={(verifiedOnly) => set({ verifiedOnly })}
                trackColor={{ true: t.colors.primary }}
                accessibilityLabel="검수 완료 작품만"
              />
            </View>
          </ScrollView>
          <View style={[styles.foot, { borderColor: t.colors.border }]}>
            <Button title="초기화" variant="ghost" onPress={() => setDraft(EMPTY_FILTERS)} />
            <Button
              title="적용"
              style={{ flex: 1 }}
              onPress={() => {
                onChange(draft);
                setOpen(false);
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 },
  body: { padding: 20, gap: 20, paddingBottom: 40 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  foot: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
