import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { AddressText } from './order-ui';

export const ADDRESSES_KEY = ['addresses'] as const;
export const useAddresses = () => useQuery({ queryKey: ADDRESSES_KEY, queryFn: api.orders.addresses });

/** 배송지 선택 (주문서·결제 대기). 선택이 비어 있으면 기본 배송지를 고른다 */
export function AddressPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTheme();
  const q = useAddresses();
  const list = q.data ?? [];
  useEffect(() => {
    if (!selected && list.length) onSelect((list.find((a) => a.isDefault) ?? list[0]!).id);
  }, [selected, list, onSelect]);

  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="배송지">
      {list.map((a) => {
        const on = a.id === selected;
        return (
          <Pressable
            key={a.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onSelect(a.id)}
            style={[styles.card, { borderColor: on ? t.colors.primary : t.colors.border }]}
          >
            <View style={{ flex: 1 }}>
              {a.isDefault && (
                <Text variant="caption" color="primary">
                  기본 배송지
                </Text>
              )}
              <AddressText a={a} />
            </View>
            <Button
              title="수정"
              size="sm"
              variant="ghost"
              onPress={() => router.push({ pathname: '/addresses/edit', params: { id: a.id } })}
            />
          </Pressable>
        );
      })}
      <Button title="+ 새 배송지 추가" variant="outline" onPress={() => router.push('/addresses/edit')} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
});
