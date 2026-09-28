import { router, Stack } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useAddresses } from '@/components/order/address-list';
import { AddressText } from '@/components/order/order-ui';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** 배송지 관리: 눌러서 수정·삭제, 기본 배송지 표시 */
export default function AddressesScreen() {
  const t = useTheme();
  const q = useAddresses();
  if (q.isPending) return <Loading />;
  return (
    <>
      <Stack.Screen options={{ title: '배송지 관리' }} />
      <FlatList
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        contentInsetAdjustmentBehavior="automatic"
        data={q.data ?? []}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<Empty title="저장된 배송지가 없어요" />}
        renderItem={({ item: a }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="눌러서 수정"
            onPress={() => router.push({ pathname: '/addresses/edit', params: { id: a.id } })}
            style={[styles.card, { borderColor: a.isDefault ? t.colors.primary : t.colors.border }]}
          >
            {a.isDefault && (
              <Text variant="caption" color="primary">
                기본 배송지
              </Text>
            )}
            <AddressText a={a} />
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 8 }}>
            <Button title="+ 새 배송지 추가" onPress={() => router.push('/addresses/edit')} />
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: 1, borderRadius: 8, gap: 2 },
});
