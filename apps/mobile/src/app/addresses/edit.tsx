import { ApiError } from '@shop/api-client';
import { addressSchema, type AddressInput } from '@shop/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { ADDRESSES_KEY, useAddresses } from '@/components/order/address-list';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { searchPostcode } from '@/lib/bridge';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

const MEMO_PRESETS = ['door', 'security', 'callFirst', 'fragile'] as const;
/** 공용 스키마의 한국어 오류 대신 필드별 번역 문구 */
const INVALID = {
  recipient: 'address.invalid.recipient',
  phone: 'address.invalid.phone',
  zipCode: 'address.invalid.zipCode',
  address1: 'address.invalid.address1',
} as const;
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
  const { t: tr } = useTranslation(['order', 'common']);
  const qc = useQueryClient();
  const initial = useAddresses().data?.find((a) => a.id === id);
  const [d, setD] = useState<AddressInput>(initial ? { ...initial } : empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<AddressInput>) => setD((prev) => ({ ...prev, ...patch }));
  const onError = (e: unknown) =>
    Alert.alert(e instanceof ApiError ? e.message : tr('common:state.saveFailed'));
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
      setErrors(
        Object.fromEntries(
          r.error.issues.map((i) => {
            const field = String(i.path[0]);
            return [field, field in INVALID ? tr(INVALID[field as keyof typeof INVALID]) : i.message];
          }),
        ),
      );
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
      <Stack.Screen options={{ title: id ? tr('address.editTitle') : tr('address.newTitle') }} />
      <Field
        label={tr('address.recipient')}
        value={d.recipient}
        onChangeText={(recipient) => set({ recipient })}
        error={errors.recipient}
        maxLength={50}
        autoComplete="name"
      />
      <Field
        label={tr('address.phone')}
        value={d.phone}
        onChangeText={(phone) => set({ phone: phone.replace(/\D/g, '') })}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={11}
        placeholder={tr('address.phonePlaceholder')}
      />
      <View style={{ gap: 6 }}>
        <Text variant="label">{tr('address.address')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            d.address1 ? tr('address.researchA11y', { address: d.address1 }) : tr('address.searchA11y')
          }
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
              {tr('address.searchPlaceholder')}
            </Text>
          )}
          <Text variant="label" color="primary">
            {d.address1 ? tr('address.change') : tr('common:action.search')}
          </Text>
        </Pressable>
        {(errors.address1 || errors.zipCode) && (
          <Text variant="small" color="destructive">
            {errors.address1 ?? errors.zipCode}
          </Text>
        )}
      </View>
      <Field
        label={tr('address.detail')}
        value={d.address2}
        onChangeText={(address2) => set({ address2 })}
        maxLength={200}
        placeholder={tr('address.detailPlaceholder')}
      />
      <Field
        label={tr('address.memo')}
        value={d.memo}
        onChangeText={(memo) => set({ memo })}
        maxLength={200}
      />
      <View style={styles.presets}>
        {/* 메모는 판매자·택배 기사가 읽으므로 버튼만 번역하고 넣는 글은 한국어로 */}
        {MEMO_PRESETS.map((key) => (
          <Button
            key={key}
            title={tr(`address.memoPreset.${key}`)}
            size="sm"
            variant="outline"
            onPress={() => set({ memo: tr(`address.memoPreset.${key}`, { lng: 'ko' }) })}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Text style={{ flex: 1 }}>{tr('address.setDefault')}</Text>
        <Switch
          value={d.isDefault}
          onValueChange={(isDefault) => set({ isDefault })}
          trackColor={{ true: t.colors.primary }}
          accessibilityLabel={tr('address.setDefault')}
        />
      </View>
      <Button title={tr('common:action.save')} size="lg" loading={save.isPending} onPress={submit} />
      {id && (
        <Button
          title={tr('address.delete')}
          variant="ghost"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert(tr('address.deleteTitle'), undefined, [
              { text: tr('common:action.cancel'), style: 'cancel' },
              { text: tr('common:action.delete'), style: 'destructive', onPress: () => remove.mutate() },
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
