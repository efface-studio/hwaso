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

/** iOS 알약에 보이는 짧은 날짜·시간 ("2026. 10. 1." · "오후 4:10") */
const pillDate = (d: Date) =>
  d.toLocaleDateString(LOCALE[currentLanguage()], { year: 'numeric', month: 'numeric', day: 'numeric' });
const pillTime = (d: Date) =>
  d.toLocaleTimeString(LOCALE[currentLanguage()], { hour: 'numeric', minute: '2-digit' });

/** 같은 날(현지 시각)인지 */
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * iOS 날짜·시간 알약 (시스템 컴팩트 선택기 모양).
 * 시스템 컴팩트 선택기는 측정한 칸 안에서 내용을 오른쪽에 붙여 글자 길이에 따라 왼쪽 끝이 달라진다 —
 * 알약을 직접 그려 모든 칸의 왼쪽 끝을 맞추고, 누르면 아래에 달력·휠을 펼친다.
 */
function IosDateTime({
  label,
  value,
  current,
  onChange,
  mode,
  minimumDate,
}: {
  label: string;
  value: Date | null;
  current: Date;
  onChange: (d: Date) => void;
  mode: 'date' | 'datetime';
  minimumDate?: Date;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('common');
  const [open, setOpen] = useState<'date' | 'time' | null>(null);
  const locale = LOCALE[currentLanguage()];
  const clamp = (d: Date) => (minimumDate && d < minimumDate ? new Date(minimumDate) : d);
  // 날짜를 고르면 시간은, 시간을 고르면 날짜는 그대로 둔다
  const pickDate = (d: Date) => {
    const next = new Date(current);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(clamp(next));
  };
  const pickTime = (d: Date) => {
    const next = new Date(current);
    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
    onChange(clamp(next));
  };
  const pill = (part: 'date' | 'time', text: string, spoken: string) => {
    const on = open === part;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${spoken}`}
        accessibilityState={{ expanded: on }}
        hitSlop={{ top: 4, bottom: 4 }}
        onPress={() => {
          // 값이 없으면 펼칠 때 보이는 날짜(오늘)를 고른 것으로 둔다 — 달력에서 이미 선택된 오늘은 다시 눌러도 바뀌지 않는다
          if (!value) onChange(clamp(current));
          setOpen(on ? null : part);
        }}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: t.colors.surface2, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text
          style={[styles.pillText, { fontSize: t.type('h3').fontSize }]}
          color={on ? 'primary' : 'foreground'}
        >
          {text}
        </Text>
      </Pressable>
    );
  };
  const empty = tr('action.select');
  return (
    <>
      <View style={styles.pills}>
        {value ? (
          <>
            {pill('date', pillDate(value), fmt(value, 'date'))}
            {mode === 'datetime' && pill('time', pillTime(value), pillTime(value))}
          </>
        ) : (
          pill('date', empty, empty)
        )}
      </View>
      {open === 'date' && (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          locale={locale}
          minimumDate={minimumDate}
          accentColor={t.colors.primary}
          onChange={(_, d) => d && pickDate(d)}
        />
      )}
      {open === 'time' && (
        <DateTimePicker
          value={current}
          mode="time"
          display="spinner"
          locale={locale}
          // 시간 휠의 최소값은 고른 날이 최소 날짜와 같은 날일 때만 의미가 있다
          minimumDate={minimumDate && sameDay(current, minimumDate) ? minimumDate : undefined}
          minuteInterval={10}
          accentColor={t.colors.primary}
          onChange={(_, d) => d && pickTime(d)}
        />
      )}
    </>
  );
}

/** 날짜(·시간) 선택: iOS 는 알약 + 펼치는 시스템 달력·휠, Android 는 시스템 대화상자, 웹 미리보기는 텍스트 입력 */
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
        <IosDateTime
          label={label}
          value={value}
          current={current}
          onChange={onChange}
          mode={mode}
          minimumDate={minimumDate}
        />
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
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 시스템 컴팩트 선택기 알약과 같은 모양 (둥근 회색 바탕, 17pt 보통 굵기)
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontWeight: '400' },
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
