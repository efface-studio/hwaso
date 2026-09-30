import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { currentLanguage, LOCALE } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import { useTheme } from '@/theme';
import { Button } from './button';
import { Field } from './field';
import { Text } from './text';

type Common = { label: string; error?: string | null; hint?: string };

/** 금액 입력 (원): 숫자만 받고 천 단위 쉼표로 보여준다 */
export function PriceField({
  value,
  onChange,
  placeholder,
  editable,
  ...rest
}: Common & {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  return (
    <Field
      {...rest}
      keyboardType="number-pad"
      inputMode="numeric"
      editable={editable}
      placeholder={placeholder ?? '0'}
      value={value != null ? formatNumber(value) : ''}
      onChangeText={(t) => {
        const digits = t.replace(/[^\d]/g, '');
        onChange(digits ? Math.min(Number(digits), 99_999_999_999) : null);
      }}
    />
  );
}

const fmt = (d: Date, mode: 'date' | 'datetime') =>
  d.toLocaleString(LOCALE[currentLanguage()], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    ...(mode === 'datetime' ? { hour: 'numeric', minute: '2-digit' } : {}),
  });

/** 날짜(·시간) 선택: iOS 는 시스템 컴팩트 선택기, Android 는 시스템 대화상자, 웹 미리보기는 텍스트 입력 */
export function DateTimeField({
  label,
  error,
  hint,
  value,
  onChange,
  mode = 'datetime',
  minimumDate,
}: Common & {
  value: Date | null;
  onChange: (d: Date) => void;
  mode?: 'date' | 'datetime';
  minimumDate?: Date;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const current = value ?? new Date();
  const openAndroid = () =>
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      minimumDate,
      onChange: (e, day) => {
        if (e.type !== 'set' || !day) return;
        if (mode === 'date') return onChange(day);
        DateTimePickerAndroid.open({
          value: day,
          mode: 'time',
          onChange: (e2, time) => e2.type === 'set' && time && onChange(time),
        });
      },
    });

  if (Platform.OS === 'web')
    return (
      <Field
        label={`${label} (${mode === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm'})`}
        error={error}
        hint={hint}
        defaultValue={
          value
            ? value
                .toISOString()
                .slice(0, mode === 'date' ? 10 : 16)
                .replace('T', ' ')
            : ''
        }
        onChangeText={(v) => {
          const d = new Date(v.replace(' ', 'T'));
          if (!Number.isNaN(d.getTime())) onChange(d);
        }}
      />
    );

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={styles.row}>
          <DateTimePicker
            value={current}
            mode={mode}
            display="compact"
            locale={LOCALE[currentLanguage()]}
            minimumDate={minimumDate}
            minuteInterval={10}
            accentColor={t.colors.primary}
            onChange={(_, d) => d && onChange(d)}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${value ? fmt(value, mode) : tr('action.select')}`}
          onPress={openAndroid}
          style={[
            styles.box,
            {
              minHeight: t.controlHeight,
              borderColor: error ? t.colors.destructive : t.colors.borderStrong,
              borderRadius: t.radius.sm,
            },
          ]}
        >
          <Text color={value ? 'foreground' : 'faint'}>{value ? fmt(value, mode) : tr('action.select')}</Text>
        </Pressable>
      )}
      {error ? (
        <Text variant="small" color="destructive">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** 목록에서 하나 고르기 (카테고리·은행 등). 누르면 시트로 목록을 연다 */
export function SelectField<T extends string>({
  label,
  error,
  hint,
  value,
  onChange,
  options,
  placeholder,
}: Common & {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const empty = placeholder ?? tr('action.select');
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? empty}`}
        onPress={() => setOpen(true)}
        style={[
          styles.box,
          styles.row,
          {
            minHeight: t.controlHeight,
            borderColor: error ? t.colors.destructive : t.colors.borderStrong,
            borderRadius: t.radius.sm,
          },
        ]}
      >
        <Text color={selected ? 'foreground' : 'faint'} style={{ flex: 1 }} numberOfLines={1}>
          {selected?.label ?? empty}
        </Text>
        <Text color="muted">⌄</Text>
      </Pressable>
      {error ? (
        <Text variant="small" color="destructive">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="muted">
          {hint}
        </Text>
      ) : null}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.sheet, { backgroundColor: t.colors.background }]}>
          <View style={styles.head}>
            <Text variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
              {label}
            </Text>
            <Button title={tr('action.close')} variant="ghost" size="sm" onPress={() => setOpen(false)} />
          </View>
          <FlatList
            alwaysBounceVertical={false}
            contentContainerStyle={{ flexGrow: 1 }}
            data={options}
            keyExtractor={(o) => o.value}
            renderItem={({ item: o }) => {
              const on = o.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={[styles.option, { minHeight: t.touch + 4, borderColor: t.colors.borderSoft }]}
                >
                  <Text style={{ flex: 1 }} color={on ? 'primary' : 'foreground'}>
                    {o.label}
                  </Text>
                  {on && <Text color="primary">✓</Text>}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  box: { borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 14, justifyContent: 'center' },
  sheet: { flex: 1, paddingTop: 16 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
