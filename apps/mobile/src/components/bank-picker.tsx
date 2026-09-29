import { BANK_GROUP_LABEL, BANKS, bankByName, type Bank, type BankGroup } from '@shop/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { selectionHaptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

/** 은행 로고 자리: 대표 색 원형 배지 + 약칭 (공식 로고 이미지를 받으면 여기서 바꿔 끼운다) */
export function BankLogo({ bank, name, size = 44 }: { bank?: Bank; name?: string; size?: number }) {
  const t = useTheme();
  const mark = bank?.mark ?? (name ?? '?').slice(0, 2);
  // 약칭 길이에 맞춰 글자 크기를 줄인다
  const fontSize = Math.round(size * (mark.length <= 2 ? 0.34 : mark.length <= 3 ? 0.28 : 0.22));
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bank?.color ?? t.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: bank?.fg ?? t.colors.muted, fontSize, fontWeight: '800', letterSpacing: -0.3 }}>
        {mark}
      </Text>
    </View>
  );
}

/** 격자 폭에 맞춘 열 수 (휴대폰 3열 · 넓은 화면 4열 · 아이패드 5~6열) */
const columnsFor = (width: number) => (width >= 820 ? 6 : width >= 640 ? 5 : width >= 460 ? 4 : 3);

const GROUPS: BankGroup[] = ['bank', 'mutual', 'foreign'];

/** 은행 선택 입력: 누르면 로고 격자 시트가 열린다 (검색 · 은행/상호금융/해외 은행 묶음) */
export function BankField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string | undefined;
  onChange: (name: string) => void;
  error?: string;
}) {
  const t = useTheme();
  const { width: screen } = useWindowDimensions();
  // 시트 안 격자의 실제 폭 (아이패드는 시트가 화면보다 좁다). 재기 전에는 화면 폭 - 좌우 여백
  const [gridWidth, setGridWidth] = useState(screen - 40);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = bankByName(value);
  const query = q.trim().toLowerCase();
  const match = (b: Bank) =>
    !query || b.name.toLowerCase().includes(query) || b.mark.toLowerCase().includes(query);
  const gap = 8;
  const cols = columnsFor(gridWidth);
  const cell = Math.floor((gridWidth - gap * (cols - 1)) / cols);

  const pick = (b: Bank) => {
    selectionHaptic();
    onChange(b.name);
    setOpen(false);
    setQ('');
  };

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? '선택 안 됨'}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          {
            minHeight: t.controlHeight + 8,
            borderRadius: t.radius.sm,
            borderColor: error ? t.colors.destructive : t.colors.borderStrong,
            backgroundColor: pressed ? t.colors.surface2 : 'transparent',
          },
        ]}
      >
        {value ? (
          <>
            <BankLogo bank={selected} name={value} size={32} />
            <Text style={{ flex: 1 }}>{value}</Text>
          </>
        ) : (
          <Text color="faint" style={{ flex: 1 }}>
            은행 선택
          </Text>
        )}
        <Icon ios="chevron.down" android="expand_more" color="muted" size={16} />
      </Pressable>
      {error ? (
        <Text variant="small" color="destructive">
          {error}
        </Text>
      ) : null}

      {open && (
        <Sheet
          title="은행 선택"
          onClose={() => {
            setOpen(false);
            setQ('');
          }}
        >
          <View
            onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
            style={[styles.search, { backgroundColor: t.colors.surface2, borderRadius: t.radius.md }]}
          >
            <Icon ios="magnifyingglass" android="search" color="muted" size={16} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="은행 이름 검색"
              placeholderTextColor={t.colors.faint}
              clearButtonMode="while-editing"
              accessibilityLabel="은행 이름 검색"
              style={[t.inputType(), styles.searchInput, { color: t.colors.foreground }]}
            />
          </View>
          {GROUPS.map((g) => {
            const list = BANKS.filter((b) => b.group === g && match(b));
            if (!list.length) return null;
            return (
              <View key={g} style={{ gap: 10 }}>
                <Text variant="label" color="muted">
                  {BANK_GROUP_LABEL[g]}
                </Text>
                <View style={[styles.grid, { gap }]}>
                  {list.map((b) => {
                    const on = b.name === value;
                    return (
                      <Pressable
                        key={b.code}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={b.name}
                        onPress={() => pick(b)}
                        style={({ pressed }) => [
                          styles.tile,
                          {
                            width: cell,
                            borderRadius: t.radius.md,
                            borderColor: on ? t.colors.primary : t.colors.border,
                            backgroundColor: on
                              ? t.colors.primarySoft
                              : pressed
                                ? t.colors.surface2
                                : t.colors.surface,
                          },
                        ]}
                      >
                        <BankLogo bank={b} />
                        <Text variant="caption" numberOfLines={2} style={styles.tileName}>
                          {b.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, minHeight: 42 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  tileName: { textAlign: 'center', fontWeight: '600' },
});
