import { ApiError } from '@shop/api-client';
import {
  auctionToInput,
  createAuctionSchema,
  defaultAuction,
  suggestIncrement,
  type AuctionDraft,
} from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { AuctionFields } from '@/components/sell/fields';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) =>
  e instanceof ApiError ? e.message : '잠시 문제가 발생했어요. 다시 시도해주세요.';

/** 이미 등록한 작품의 경매 등록·예약 (등록 중 예약이 실패했을 때도 여기로 온다) */
export default function AuctionSetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const product = useQuery({ queryKey: ['product-edit', id], queryFn: () => api.market.product(id) });
  const [a, setA] = useState<AuctionDraft>(defaultAuction);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  if (product.isPending) return <Loading variant="text" />;
  const p = product.data;
  if (!p?.isMine) return <Empty kind="lock" title="내 작품만 경매로 등록할 수 있어요" />;

  const submit = async () => {
    const input = auctionToInput(
      { ...a, bidIncrement: a.bidIncrement ?? suggestIncrement(a.startPrice ?? 0) },
      id,
    );
    const r = createAuctionSchema.safeParse(input);
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[i.path.join('.')] ??= i.message;
      setErrors(e);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      // 예약에 실패했던 초안 경매가 있으면 조건을 고쳐 다시 예약한다
      let auctionId: string;
      if (p.auction?.status === 'DRAFT') {
        const { productId: _productId, ...patch } = r.data;
        auctionId = p.auction.id;
        await api.auctions.update(auctionId, patch);
      } else {
        auctionId = (await api.auctions.create(r.data)).id;
      }
      await api.auctions.schedule(auctionId);
      void qc.invalidateQueries({ queryKey: ['seller'] });
      void qc.invalidateQueries({ queryKey: ['product-edit', id] });
      Alert.alert('경매를 예약했어요');
      router.replace({ pathname: '/auctions/[id]', params: { id: auctionId } });
    } catch (e) {
      Alert.alert('경매를 예약하지 못했어요', errMsg(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: '경매 등록' }} />
      <Text variant="h2">{p.title}</Text>
      <AuctionFields a={a} set={(patch) => setA((x) => ({ ...x, ...patch }))} errors={errors} />
      {Object.keys(errors).length > 0 && (
        <Text variant="small" color="destructive">
          {Object.values(errors)[0]}
        </Text>
      )}
      <Button title="경매 예약하기" size="lg" loading={pending} onPress={() => void submit()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
});
