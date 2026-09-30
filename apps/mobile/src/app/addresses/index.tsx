import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAddresses } from '@/components/order/address-list';
import { AddressText } from '@/components/order/order-ui';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { List } from '@/components/ui/list';
import { useTheme } from '@/theme';

/** 배송지 관리: 눌러서 수정·삭제, 기본 배송지 표시 */
export default function AddressesScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('order');
  const q = useAddresses();
  if (q.isPending) return <Loading variant="plain-list" />;
  return (
    <>
      <Stack.Screen options={{ title: tr('address.manageTitle') }} />
      <List
        style={{ backgroundColor: t.colors.background }}
        contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 10 }}
        contentInsetAdjustmentBehavior="automatic"
        data={q.data ?? []}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<Empty kind="pin" title={tr('address.empty')} />}
        renderItem={({ item: a }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={tr('address.editHint')}
            onPress={() => router.push({ pathname: '/addresses/edit', params: { id: a.id } })}
            style={[styles.card, { borderColor: a.isDefault ? t.colors.primary : t.colors.border }]}
          >
            {a.isDefault && (
              <Text variant="caption" color="primary">
                {tr('address.default')}
              </Text>
            )}
            <AddressText a={a} />
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 8 }}>
            <Button title={tr('address.add')} onPress={() => router.push('/addresses/edit')} />
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: 1, borderRadius: 8, gap: 2 },
});
