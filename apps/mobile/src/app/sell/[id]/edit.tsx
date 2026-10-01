import { ApiError } from '@shop/api-client';
import {
  containsProhibited,
  draftFromProduct,
  draftToInput,
  updateProductSchema,
  type ProductDraft,
} from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { AuthenticityFields, BasicFields, DetailFields, PriceFields } from '@/components/sell/fields';
import { PhotoManager } from '@/components/sell/photo-manager';
import { Button } from '@/components/ui/button';
import { Empty, Loading } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme';
import { schemaMessage } from '@/i18n/validation';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('sell:error.generic'));

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
  const { t: tr } = useTranslation(['sell', 'common']);
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

  if (product.isError)
    return <Empty kind="error" title={tr('edit.loadFailed')} description={errMsg(product.error)} />;
  if (!product.data || !d) return <Loading variant="text" />;
  const p = product.data;
  if (!p.isMine) return <Empty kind="lock" title={tr('edit.notMine')} />;

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
    const e: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) e[i.path.join('.')] ??= schemaMessage(i.message);
    // 쓸 수 없는 표현은 서버도 막지만, 입력한 자리에서 먼저 알려 준다
    if (containsProhibited(d.title)) e.title ??= tr('common:validation.prohibited');
    if (containsProhibited(d.description)) e.description ??= tr('common:validation.prohibited');
    if (!r.success || Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    void run('save', () => api.market.updateProduct(id, r.data), tr('edit.saved'));
  };
  const remove = () =>
    Alert.alert(tr('manage.deleteConfirm'), tr('edit.deleteMessage'), [
      { text: tr('common:action.cancel'), style: 'cancel' },
      {
        text: tr('common:action.delete'),
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
      <Stack.Screen options={{ title: tr('common:screen.sellEdit') }} />
      <View style={styles.actions}>
        <Text variant="label" color={p.status === 'ACTIVE' ? 'primary' : 'muted'}>
          {label('productStatus', p.status)}
        </Text>
        <Button
          title={tr('manage.viewListing')}
          size="sm"
          variant="ghost"
          onPress={() => router.push({ pathname: '/products/[id]', params: { id } })}
        />
      </View>
      <View style={styles.actions}>
        {p.status === 'DRAFT' && p.saleType !== 'AUCTION' && (
          <Button
            title={tr('manage.publish')}
            size="sm"
            loading={pending === 'publish'}
            onPress={() => void run('publish', () => api.market.publishProduct(id), tr('manage.published'))}
          />
        )}
        {p.saleType === 'AUCTION' && (!p.auction || p.auction.status === 'DRAFT') && (
          <Button
            title={tr('manage.registerAuction')}
            size="sm"
            onPress={() => router.push({ pathname: '/sell/[id]/auction', params: { id } })}
          />
        )}
        {p.status === 'ACTIVE' && (
          <Button
            title={tr('manage.pause')}
            size="sm"
            variant="outline"
            loading={pending === 'pause'}
            onPress={() => void run('pause', () => api.market.pauseProduct(id), tr('manage.paused'))}
          />
        )}
        {p.status === 'HIDDEN' && (
          <Button
            title={tr('manage.resume')}
            size="sm"
            variant="outline"
            loading={pending === 'resume'}
            onPress={() => void run('resume', () => api.market.resumeProduct(id), tr('manage.resumed'))}
          />
        )}
      </View>
      {auctionStarted && (
        <Text variant="small" color="muted">
          {tr('edit.locked')}
        </Text>
      )}
      <Section title={tr('section.photos')}>
        <PhotoManager images={d.images} onChange={(v) => set('images', v)} locked={auctionStarted} />
      </Section>
      <Section title={tr('section.basic')}>
        <BasicFields d={d} set={set} categories={categories.data ?? []} errors={errors} />
      </Section>
      {!auctionStarted && (
        <Section title={tr('section.price')}>
          <PriceFields d={d} set={set} errors={errors} lockSaleType={!!p.auction} />
        </Section>
      )}
      <Section title={tr('section.detail')}>
        <DetailFields d={d} set={set} errors={errors} />
      </Section>
      <Section title={tr('section.authenticity')} description={tr('section.authenticityHint')}>
        <AuthenticityFields d={d} set={set} errors={errors} />
      </Section>
      {Object.keys(errors).length > 0 && (
        <Text variant="small" color="destructive">
          {Object.values(errors)[0]}
        </Text>
      )}
      <Button title={tr('common:action.save')} size="lg" loading={pending === 'save'} onPress={save} />
      <Button title={tr('edit.delete')} variant="ghost" loading={pending === 'delete'} onPress={remove} />
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
