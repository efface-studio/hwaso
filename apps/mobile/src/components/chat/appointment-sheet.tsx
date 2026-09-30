import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { currentLanguage, LOCALE } from '@/i18n';
import { useTheme } from '@/theme';

const fmt = (d: Date) =>
  d.toLocaleString(LOCALE[currentLanguage()], {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** 거래 약속 제안: 날짜·시간(OS 기본 선택기) + 장소 */
export function AppointmentSheet({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (a: { at: string; place: string }) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['chat', 'common']);
  const locale = LOCALE[currentLanguage()];
  const [at, setAt] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setMinutes(0, 0, 0);
    return d;
  });
  const [place, setPlace] = useState('');
  const openAndroid = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: at,
      mode,
      minimumDate: new Date(),
      onChange: (e, d) => e.type === 'set' && d && setAt(d),
    });
  const valid = !!place.trim() && at.getTime() > Date.now();

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Text variant="h2" accessibilityRole="header">
            {tr('appointment.title')}
          </Text>
          <Button title={tr('common:action.close')} variant="ghost" size="sm" onPress={onClose} />
        </View>
        <Text variant="label">{tr('appointment.dateTime')}</Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={at}
            mode="datetime"
            display="inline"
            minimumDate={new Date()}
            minuteInterval={10}
            locale={locale}
            accentColor={t.colors.primary}
            onChange={(_, d) => d && setAt(d)}
          />
        ) : Platform.OS === 'android' ? (
          <View style={styles.row}>
            <Button
              title={at.toLocaleDateString(locale)}
              variant="outline"
              onPress={() => openAndroid('date')}
            />
            <Button
              title={at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}
              variant="outline"
              onPress={() => openAndroid('time')}
            />
          </View>
        ) : (
          // 웹 미리보기용 대체 입력
          <Field
            label={tr('appointment.webDateTime')}
            defaultValue={at.toISOString().slice(0, 16).replace('T', ' ')}
            onChangeText={(v) => {
              const d = new Date(v.replace(' ', 'T'));
              if (!Number.isNaN(d.getTime())) setAt(d);
            }}
          />
        )}
        <Text variant="small" color="muted">
          {fmt(at)}
        </Text>
        <Field
          label={tr('appointment.place')}
          placeholder={tr('appointment.placePlaceholder')}
          maxLength={100}
          value={place}
          onChangeText={setPlace}
        />
        <Button
          title={tr('appointment.submit')}
          disabled={!valid}
          onPress={() => onSubmit({ at: at.toISOString(), place: place.trim() })}
        />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8 },
});
