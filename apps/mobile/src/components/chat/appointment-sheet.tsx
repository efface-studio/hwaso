import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const fmt = (d: Date) =>
  d.toLocaleString('ko-KR', {
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
            거래 약속
          </Text>
          <Button title="닫기" variant="ghost" size="sm" onPress={onClose} />
        </View>
        <Text variant="label">날짜와 시간</Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={at}
            mode="datetime"
            display="inline"
            minimumDate={new Date()}
            minuteInterval={10}
            locale="ko-KR"
            accentColor={t.colors.primary}
            onChange={(_, d) => d && setAt(d)}
          />
        ) : Platform.OS === 'android' ? (
          <View style={styles.row}>
            <Button
              title={at.toLocaleDateString('ko-KR')}
              variant="outline"
              onPress={() => openAndroid('date')}
            />
            <Button
              title={at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
              variant="outline"
              onPress={() => openAndroid('time')}
            />
          </View>
        ) : (
          // 웹 미리보기용 대체 입력
          <Field
            label="일시 (YYYY-MM-DD HH:mm)"
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
          label="장소"
          placeholder="예) 인사동 쌈지길 정문"
          maxLength={100}
          value={place}
          onChangeText={setPlace}
        />
        <Button
          title="약속 보내기"
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
