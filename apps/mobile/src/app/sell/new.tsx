import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@shop/api-client';
import {
  SALE_TYPE_LABEL,
  auctionToInput,
  createAuctionSchema,
  createProductSchema,
  defaultAuction,
  draftToInput,
  emptyDraft,
  formatPrice,
  suggestIncrement,
  type AuctionDraft,
  type ProductDraft,
} from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme';

const DRAFT_KEY = 'hwaso.sell-draft';
type Step = 'photos' | 'basic' | 'price' | 'auction' | 'detail' | 'review';
const TITLE: Record<Step, string> = {
  photos: '작품 사진을 올려주세요',
  basic: '어떤 작품인가요?',
  price: '어떻게 판매할까요?',
  auction: '경매 조건을 정해주세요',
  detail: '작품 정보를 더해주세요',
  review: '마지막으로 확인해주세요',
};
const issuesToErrors = (issues: { path: PropertyKey[]; message: string }[]) => {
  const out: Record<string, string> = {};
  for (const i of issues) out[i.path.join('.')] ??= i.message;
  return out;
};
const errMsg = (e: unknown) =>
  e instanceof ApiError ? e.message : '잠시 문제가 발생했어요. 다시 시도해주세요.';

/**
 * 작품 등록 — 한 화면에 한 가지 질문 (웹 /sell 과 같은 단계). 필수 입력만 먼저 받고 상세 정보는 선택.
 * 입력 중인 내용은 이 기기에 임시 저장해 앱을 닫아도 이어서 쓸 수 있다.
 */
export default function SellNewScreen() {
  const t = useTheme();
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
      <Empty title="로그인이 필요해요" action={{ title: '로그인', onPress: () => router.push('/login') }} />
    );
  if (!user.isSeller)
    return (
      <Empty
        title="판매자 등록이 필요해요"
        description="판매 대금을 받을 계좌를 등록하면 바로 작품을 올릴 수 있어요."
        action={{ title: '판매자 등록하기', onPress: () => router.replace('/seller/register') }}
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
    if (s === 'photos' && d.images.length === 0) e.images = '사진을 1장 이상 올려주세요.';
    if (s === 'basic') {
      if (d.title.trim().length < 2) e.title = '작품명을 2자 이상 입력해주세요.';
      if (!d.categoryId) e.categoryId = '카테고리를 선택해주세요.';
    }
    if (s === 'price' && d.saleType !== 'AUCTION' && !d.price) e.price = '판매 가격을 입력해주세요.';
    if (s === 'price' && d.saleType === 'RESERVATION' && !d.availableAt)
      e.availableAt = '판매 시작일을 입력해주세요.';
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
          Alert.alert('경매를 예약하지 못했어요', `${errMsg(e)} 경매 조건을 다시 확인해주세요.`);
          router.replace({ pathname: '/sell/[id]/auction', params: { id: product.id } });
          return;
        }
      }
      await AsyncStorage.removeItem(DRAFT_KEY);
      void qc.invalidateQueries({ queryKey: ['seller'] });
      Alert.alert('작품을 등록했어요', isAuction ? '경매가 예약되었어요.' : undefined);
      router.replace({ pathname: '/products/[id]', params: { id: product.id } });
    } catch (e) {
      Alert.alert('등록하지 못했어요', errMsg(e));
    } finally {
      setPending(false);
    }
  };

  const firstError = Object.values(errors)[0];
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen
        options={{
          title: `작품 등록 ${idx + 1}/${steps.length}`,
          headerLeft:
            idx > 0 ? () => <Button title="이전" variant="ghost" size="sm" onPress={back} /> : undefined,
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
          {TITLE[step]}
        </Text>
        {restored && idx === 0 && (
          <View style={[styles.note, { backgroundColor: t.colors.surface2 }]}>
            <Text variant="small" style={{ flex: 1 }}>
              작성하던 내용을 불러왔어요.
            </Text>
            <Button
              title="새로 작성"
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
              모두 선택 입력이에요. 자세할수록 신뢰도가 높아져요.
            </Text>
            <DetailFields d={d} set={set} errors={errors} />
            <Text variant="h3" style={{ marginTop: 8 }}>
              진위 정보
            </Text>
            <AuthenticityFields d={d} set={set} errors={errors} />
          </>
        )}
        {step === 'review' &&
          (
            [
              ['사진', `${d.images.length}장`],
              ['작품명', d.title],
              ['작가', d.artistName || '—'],
              ['판매 방식', SALE_TYPE_LABEL[d.saleType]],
              [
                d.saleType === 'AUCTION' ? '시작가 · 일정' : '가격',
                d.saleType === 'AUCTION'
                  ? `${formatPrice(auction.startPrice ?? 0)} · ${new Date(auction.startsAt).toLocaleString('ko-KR')} ~ ${new Date(auction.endsAt).toLocaleString('ko-KR')}`
                  : formatPrice(d.price ?? 0),
              ],
              ['배송', `${d.shippingFee ? formatPrice(d.shippingFee) : '무료'} · ${d.shippingMethod}`],
              ['인증서', d.hasCertificate ? `${d.certIssuer} ${d.certNumber} (검수 대기)` : '없음'],
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
            title={d.saleType === 'AUCTION' ? '작품 등록하고 경매 예약하기' : '작품 등록하기'}
            size="lg"
            block
            loading={pending}
            onPress={() => void submit()}
          />
        ) : (
          <Button title="다음" size="lg" block onPress={next} />
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
