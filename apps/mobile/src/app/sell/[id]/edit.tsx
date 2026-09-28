import { ApiError } from '@shop/api-client';
import {
  PRODUCT_STATUS_LABEL,
  draftFromProduct,
  draftToInput,
  updateProductSchema,
  type ProductDraft,
} from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { AuthenticityFields, BasicFields, DetailFields, PriceFields } from '@/components/sell/fields';
import { PhotoManager } from '@/components/sell/photo-manager';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';

const errMsg = (e: unknown) =>
  e instanceof ApiError ? e.message : '잠시 문제가 발생했어요. 다시 시도해주세요.';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.section, { borderColor: t.colors.border }]}>
      <Text variant="h3" accessibilityRole="header">
        {title}
      </Text>
      {description && (
        <Text variant="small" color="muted">
          {description}
        </Text>
      )}
      {children}
    </View>
  );
}

/** 작품 수정 ↔ 게시 · 판매 중지/재개 · 경매 등록 · 삭제 (웹 /sell/[id]/edit 과 같은 규칙) */
export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const key = ['product-edit', id];
  const product = useQuery({ queryKey: key, queryFn: () => api.market.product(id) });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.market.categories,
    staleTime: 600_000,
  });
  const [d, setD] = useState<ProductDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (product.data && !d) setD(draftFromProduct(product.data));
  }, [product.data, d]);

  if (product.isError) return <Empty title="작품을 불러오지 못했어요" description={errMsg(product.error)} />;
  if (!product.data || !d) return <Loading />;
  const p = product.data;
  if (!p.isMine) return <Empty title="내 작품만 수정할 수 있어요" />;

  const auctionStarted = !!p.auction && ['LIVE', 'ENDED', 'SETTLED'].includes(p.auction.status);
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) =>
    setD((x) => (x ? { ...x, [k]: v } : x));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['product', id] });
    void qc.invalidateQueries({ queryKey: ['seller'] });
  };
  const run = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setPending(label);
    try {
      await fn();
      Alert.alert(success);
      refresh();
    } catch (e) {
      Alert.alert(errMsg(e));
    } finally {
      setPending(null);
    }
  };
  const save = () => {
    const { publish: _publish, ...input } = draftToInput(d, false);
    // 경매가 시작된 작품은 가격·판매 방식·사진을 보내지 않는다 (서버가 잠근 항목)
    const body = auctionStarted
      ? { ...input, images: undefined, price: undefined, saleType: undefined }
      : input;
    const r = updateProductSchema.safeParse(body);
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[i.path.join('.')] ??= i.message;
      setErrors(e);
      return;
    }
    setErrors({});
    void run('save', () => api.market.updateProduct(id, r.data), '저장했어요');
  };
  const remove = () =>
    Alert.alert('작품을 삭제할까요?', '삭제하면 판매 페이지와 관심 목록에서 사라지며 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setPending('delete');
          try {
            await api.market.deleteProduct(id);
            void qc.invalidateQueries({ queryKey: ['seller'] });
            goBack();
          } catch (e) {
            Alert.alert(errMsg(e));
            setPending(null);
          }
        },
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: '작품 수정' }} />
      <View style={styles.actions}>
        <Text variant="label" color={p.status === 'ACTIVE' ? 'primary' : 'muted'}>
          {PRODUCT_STATUS_LABEL[p.status]}
        </Text>
        <Button
          title="판매 페이지 보기"
          size="sm"
          variant="ghost"
          onPress={() => router.push({ pathname: '/products/[id]', params: { id } })}
        />
      </View>
      <View style={styles.actions}>
        {p.status === 'DRAFT' && p.saleType !== 'AUCTION' && (
          <Button
            title="게시하기"
            size="sm"
            loading={pending === 'publish'}
            onPress={() => void run('publish', () => api.market.publishProduct(id), '작품을 게시했어요')}
          />
        )}
        {p.saleType === 'AUCTION' && (!p.auction || p.auction.status === 'DRAFT') && (
          <Button
            title="경매 등록"
            size="sm"
            onPress={() => router.push({ pathname: '/sell/[id]/auction', params: { id } })}
          />
        )}
        {p.status === 'ACTIVE' && (
          <Button
            title="판매 중지"
            size="sm"
            variant="outline"
            loading={pending === 'pause'}
            onPress={() => void run('pause', () => api.market.pauseProduct(id), '판매를 중지했어요')}
          />
        )}
        {p.status === 'HIDDEN' && (
          <Button
            title="판매 재개"
            size="sm"
            variant="outline"
            loading={pending === 'resume'}
            onPress={() => void run('resume', () => api.market.resumeProduct(id), '판매를 다시 시작했어요')}
          />
        )}
      </View>
      {auctionStarted && (
        <Text variant="small" color="muted">
          경매가 시작된 작품은 가격·판매 방식·사진을 바꿀 수 없어요.
        </Text>
      )}
      <Section title="사진">
        <PhotoManager images={d.images} onChange={(v) => set('images', v)} locked={auctionStarted} />
      </Section>
      <Section title="기본 정보">
        <BasicFields d={d} set={set} categories={categories.data ?? []} errors={errors} />
      </Section>
      {!auctionStarted && (
        <Section title="가격 · 배송">
          <PriceFields d={d} set={set} errors={errors} lockSaleType={!!p.auction} />
        </Section>
      )}
      <Section title="작품 정보">
        <DetailFields d={d} set={set} errors={errors} />
      </Section>
      <Section title="진위 정보" description="인증서를 바꾸면 다시 검수 대기 상태가 돼요.">
        <AuthenticityFields d={d} set={set} errors={errors} />
      </Section>
      {Object.keys(errors).length > 0 && (
        <Text variant="small" color="destructive">
          {Object.values(errors)[0]}
        </Text>
      )}
      <Button title="저장" size="lg" loading={pending === 'save'} onPress={save} />
      <Button title="작품 삭제" variant="ghost" loading={pending === 'delete'} onPress={remove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  section: { gap: 12, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
