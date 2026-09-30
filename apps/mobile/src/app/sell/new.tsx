import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@shop/api-client';
import {
  auctionToInput,
  createAuctionSchema,
  createProductSchema,
  defaultAuction,
  draftToInput,
  emptyDraft,
  suggestIncrement,
  type AuctionDraft,
  type ProductDraft,
} from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AuctionFields,
  AuthenticityFields,
  BasicFields,
  DetailFields,
  PriceFields,
} from '@/components/sell/fields';
import { PhotoManager } from '@/components/sell/photo-manager';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/state';
import { Text } from '@/components/ui/text';
import i18n from '@/i18n';
import { formatDateTime, formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';
import { schemaMessage } from '@/i18n/validation';

const DRAFT_KEY = 'hwaso.sell-draft';
type Step = 'photos' | 'basic' | 'price' | 'auction' | 'detail' | 'review';
const issuesToErrors = (issues: { path: PropertyKey[]; message: string }[]) => {
  const out: Record<string, string> = {};
  for (const i of issues) out[i.path.join('.')] ??= schemaMessage(i.message);
  return out;
};
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : i18n.t('sell:error.generic'));

/**
 * 작품 등록 — 한 화면에 한 가지 질문 (웹 /sell 과 같은 단계). 필수 입력만 먼저 받고 상세 정보는 선택.
 * 입력 중인 내용은 이 기기에 임시 저장해 앱을 닫아도 이어서 쓸 수 있다.
 */
export default function SellNewScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation(['sell', 'common']);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const scroll = useRef<ScrollView>(null);
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.market.categories,
    staleTime: 600_000,
  });
  const [d, setD] = useState<ProductDraft>(emptyDraft);
  const [auction, setAuction] = useState<AuctionDraft>(defaultAuction);
  const [step, setStep] = useState<Step>('photos');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { d: ProductDraft; auction: AuctionDraft };
        if (saved.d?.images?.length || saved.d?.title) {
          setD({ ...emptyDraft(), ...saved.d });
          setAuction({ ...defaultAuction(), ...saved.auction });
          setRestored(true);
        }
      })
      .catch(() => undefined) // 임시 저장을 못 읽으면 새로 시작한다
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (loaded) void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ d, auction })).catch(() => undefined);
  }, [d, auction, loaded]);

  if (!user)
    return (
      <Empty
        kind="lock"
        title={tr('gate.loginRequired')}
        action={{ title: tr('gate.login'), onPress: () => router.push('/login') }}
      />
    );
  if (!user.isSeller)
    return (
      <Empty
        kind="lock"
        title={tr('gate.sellerRequired')}
        description={tr('gate.sellerRequiredDescription')}
        action={{ title: tr('gate.registerSeller'), onPress: () => router.replace('/seller/register') }}
      />
    );

  const steps: Step[] =
    d.saleType === 'AUCTION'
      ? ['photos', 'basic', 'price', 'auction', 'detail', 'review']
      : ['photos', 'basic', 'price', 'detail', 'review'];
  const idx = steps.indexOf(step);
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const withIncrement = (a: AuctionDraft) => ({
    ...a,
    bidIncrement: a.bidIncrement ?? (a.startPrice ? suggestIncrement(a.startPrice) : null),
  });

  const validate = (s: Step): boolean => {
    const e: Record<string, string> = {};
    if (s === 'photos' && d.images.length === 0) e.images = tr('new.validation.images');
    if (s === 'basic') {
      if (d.title.trim().length < 2) e.title = tr('new.validation.title');
      if (!d.categoryId) e.categoryId = tr('new.validation.category');
    }
    if (s === 'price' && d.saleType !== 'AUCTION' && !d.price) e.price = tr('new.validation.price');
    if (s === 'price' && d.saleType === 'RESERVATION' && !d.availableAt)
      e.availableAt = tr('new.validation.availableAt');
    if (s === 'auction') {
      const r = createAuctionSchema.safeParse(auctionToInput(withIncrement(auction), 'x'));
      if (!r.success) Object.assign(e, issuesToErrors(r.error.issues));
    }
    if (s === 'review') {
      const r = createProductSchema.safeParse(draftToInput(d, true));
      if (!r.success) Object.assign(e, issuesToErrors(r.error.issues));
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const go = (next: Step) => {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const next = () => validate(step) && go(steps[idx + 1]!);
  const back = () => {
    setErrors({});
    go(steps[Math.max(0, idx - 1)]!);
  };

  const submit = async () => {
    if (!validate('review')) return;
    setPending(true);
    try {
      const isAuction = d.saleType === 'AUCTION';
      // 경매 상품은 초안으로 만든 뒤 경매를 예약하면 게시된다 (서버 규칙)
      const product = await api.market.createProduct(draftToInput(d, !isAuction));
      if (isAuction) {
        try {
          const a = await api.auctions.create(auctionToInput(withIncrement(auction), product.id));
          await api.auctions.schedule(a.id);
        } catch (e) {
          // 작품은 만들어졌으니 경매 조건만 다시 정하게 한다
          await AsyncStorage.removeItem(DRAFT_KEY);
          Alert.alert(tr('auction.scheduleFailed'), tr('new.scheduleFailedMessage', { message: errMsg(e) }));
          router.replace({ pathname: '/sell/[id]/auction', params: { id: product.id } });
          return;
        }
      }
      await AsyncStorage.removeItem(DRAFT_KEY);
      void qc.invalidateQueries({ queryKey: ['seller'] });
      Alert.alert(tr('new.created'), isAuction ? tr('new.auctionScheduled') : undefined);
      router.replace({ pathname: '/products/[id]', params: { id: product.id } });
    } catch (e) {
      Alert.alert(tr('new.createFailed'), errMsg(e));
    } finally {
      setPending(false);
    }
  };

  const firstError = Object.values(errors)[0];
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen
        options={{
          title: tr('new.title', { step: idx + 1, total: steps.length }),
          headerLeft:
            idx > 0
              ? () => <Button title={tr('common:action.back')} variant="ghost" size="sm" onPress={back} />
              : undefined,
        }}
      />
      <View style={[styles.progress, { backgroundColor: t.colors.surface2 }]}>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: steps.length, now: idx + 1 }}
          style={{
            width: `${((idx + 1) / steps.length) * 100}%`,
            height: '100%',
            backgroundColor: t.colors.primary,
          }}
        />
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="h1" accessibilityRole="header">
          {tr(`new.steps.${step}`)}
        </Text>
        {restored && idx === 0 && (
          <View style={[styles.note, { backgroundColor: t.colors.surface2 }]}>
            <Text variant="small" style={{ flex: 1 }}>
              {tr('new.restored')}
            </Text>
            <Button
              title={tr('new.startOver')}
              size="sm"
              variant="ghost"
              onPress={() => {
                setD(emptyDraft());
                setAuction(defaultAuction());
                setRestored(false);
              }}
            />
          </View>
        )}
        {step === 'photos' && <PhotoManager images={d.images} onChange={(v) => set('images', v)} />}
        {step === 'basic' && (
          <BasicFields d={d} set={set} categories={categories.data ?? []} errors={errors} />
        )}
        {step === 'price' && <PriceFields d={d} set={set} errors={errors} />}
        {step === 'auction' && (
          <AuctionFields a={auction} set={(p) => setAuction((x) => ({ ...x, ...p }))} errors={errors} />
        )}
        {step === 'detail' && (
          <>
            <Text variant="small" color="muted">
              {tr('new.detailHint')}
            </Text>
            <DetailFields d={d} set={set} errors={errors} />
            <Text variant="h3" style={{ marginTop: 8 }}>
              {tr('section.authenticity')}
            </Text>
            <AuthenticityFields d={d} set={set} errors={errors} />
          </>
        )}
        {step === 'review' &&
          (
            [
              [tr('new.review.photos'), tr('new.review.photoCount', { count: d.images.length })],
              [tr('new.review.title'), d.title],
              [tr('new.review.artist'), d.artistName || '—'],
              [tr('new.review.saleType'), label('saleType', d.saleType)],
              [
                d.saleType === 'AUCTION' ? tr('new.review.startSchedule') : tr('new.review.price'),
                d.saleType === 'AUCTION'
                  ? `${formatPrice(auction.startPrice ?? 0)} · ${formatDateTime(auction.startsAt)} ~ ${formatDateTime(auction.endsAt)}`
                  : formatPrice(d.price ?? 0),
              ],
              [
                tr('new.review.shipping'),
                `${d.shippingFee ? formatPrice(d.shippingFee) : tr('new.review.free')} · ${d.shippingMethod}`,
              ],
              [
                tr('new.review.certificate'),
                d.hasCertificate
                  ? tr('new.review.certPending', { issuer: d.certIssuer, number: d.certNumber })
                  : tr('new.review.none'),
              ],
            ] as const
          ).map(([k, v]) => (
            <View key={k} style={[styles.review, { borderColor: t.colors.borderSoft }]}>
              <Text variant="small" color="muted" style={{ width: 96 }}>
                {k}
              </Text>
              <Text variant="small" style={{ flex: 1 }}>
                {v}
              </Text>
            </View>
          ))}
        {firstError && (
          <Text variant="small" color="destructive" accessibilityLiveRegion="assertive">
            {firstError}
          </Text>
        )}
      </ScrollView>
      <View
        style={[
          styles.bar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            borderColor: t.colors.border,
            backgroundColor: t.colors.background,
          },
        ]}
      >
        {step === 'review' ? (
          <Button
            title={d.saleType === 'AUCTION' ? tr('new.submitAuction') : tr('new.submit')}
            size="lg"
            block
            loading={pending}
            onPress={() => void submit()}
          />
        ) : (
          <Button title={tr('common:action.next')} size="lg" block onPress={next} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { height: 3 },
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, borderRadius: 8 },
  review: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
