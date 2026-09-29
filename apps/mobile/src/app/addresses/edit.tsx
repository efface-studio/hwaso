import { ApiError } from '@shop/api-client';
import { addressSchema, type AddressInput } from '@shop/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { ADDRESSES_KEY, useAddresses } from '@/components/order/address-list';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { searchPostcode } from '@/lib/bridge';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

const MEMO_PRESETS = [
  '문 앞에 놓아주세요',
  '경비실에 맡겨주세요',
  '배송 전 연락 부탁드려요',
  '파손 주의 — 직접 전달해주세요',
];
const empty: AddressInput = {
  recipient: '',
  phone: '',
  zipCode: '',
  address1: '',
  address2: '',
  memo: '',
  isDefault: false,
};

/** 배송지 추가·수정. 주소는 우편번호 검색으로만 채워 오타를 막는다 */
export default function AddressEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const initial = useAddresses().data?.find((a) => a.id === id);
  const [d, setD] = useState<AddressInput>(initial ? { ...initial } : empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<AddressInput>) => setD((prev) => ({ ...prev, ...patch }));
  const onError = (e: unknown) => Alert.alert(e instanceof ApiError ? e.message : '저장하지 못했어요.');
  const done = () => {
    void qc.invalidateQueries({ queryKey: ADDRESSES_KEY });
    goBack();
  };

  const save = useMutation({
    mutationFn: () => (id ? api.orders.updateAddress(id, d) : api.orders.createAddress(d)),
    onSuccess: done,
    onError,
  });
  const remove = useMutation({ mutationFn: () => api.orders.deleteAddress(id!), onSuccess: done, onError });

  const submit = () => {
    const r = addressSchema.safeParse(d);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate();
  };
  const search = async () => {
    try {
      const r = await searchPostcode(t.scheme);
      if (r) set(r);
    } catch (e) {
      onError(e);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: id ? '배송지 수정' : '새 배송지' }} />
      <Field
        label="받는 분"
        value={d.recipient}
        onChangeText={(recipient) => set({ recipient })}
        error={errors.recipient}
        maxLength={50}
        autoComplete="name"
      />
      <Field
        label="휴대폰 번호"
        value={d.phone}
        onChangeText={(phone) => set({ phone: phone.replace(/\D/g, '') })}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={11}
        placeholder="숫자만 입력"
      />
      <View style={{ gap: 6 }}>
        <Text variant="label">주소</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={d.address1 ? `주소 ${d.address1}, 눌러서 다시 검색` : '주소 검색'}
          onPress={() => void search()}
          style={({ pressed }) => [
            styles.search,
            d.address1 ? styles.searchFilled : null,
            {
              minHeight: t.controlHeight,
              borderRadius: t.radius.sm,
              borderColor: errors.address1 || errors.zipCode ? t.colors.destructive : t.colors.borderStrong,
              backgroundColor: pressed ? t.colors.surface2 : 'transparent',
            },
          ]}
        >
          {/* 고른 뒤: 우편번호 / 주소(줄바꿈) — 버튼은 오른쪽 위에 둔다 */}
          {d.address1 ? (
            <View style={styles.picked}>
              <Text variant="small" color="muted">
                {d.zipCode}
              </Text>
              <Text>{d.address1}</Text>
            </View>
          ) : (
            <Text color="faint" style={{ flex: 1 }}>
              우편번호·도로명으로 검색
            </Text>
          )}
          <Text variant="label" color="primary">
            {d.address1 ? '변경' : '검색'}
          </Text>
        </Pressable>
        {(errors.address1 || errors.zipCode) && (
          <Text variant="small" color="destructive">
            {errors.address1 ?? errors.zipCode}
          </Text>
        )}
      </View>
      <Field
        label="상세 주소"
        value={d.address2}
        onChangeText={(address2) => set({ address2 })}
        maxLength={200}
        placeholder="동·호수 등"
      />
      <Field label="배송 메모 (선택)" value={d.memo} onChangeText={(memo) => set({ memo })} maxLength={200} />
      <View style={styles.presets}>
        {MEMO_PRESETS.map((m) => (
          <Button key={m} title={m} size="sm" variant="outline" onPress={() => set({ memo: m })} />
        ))}
      </View>
      <View style={styles.row}>
        <Text style={{ flex: 1 }}>기본 배송지로 설정</Text>
        <Switch
          value={d.isDefault}
          onValueChange={(isDefault) => set({ isDefault })}
          trackColor={{ true: t.colors.primary }}
          accessibilityLabel="기본 배송지로 설정"
        />
      </View>
      <Button title="저장" size="lg" loading={save.isPending} onPress={submit} />
      {id && (
        <Button
          title="이 배송지 삭제"
          variant="ghost"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert('배송지를 삭제할까요?', undefined, [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  searchFilled: { alignItems: 'flex-start', paddingVertical: 12 },
  picked: { flex: 1, gap: 2 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
