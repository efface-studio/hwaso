'use client';

import { ApiError } from '@shop/api-client';
import {
  createAuctionSchema,
  createProductSchema,
  formatPrice,
  SALE_TYPE_LABEL,
  suggestIncrement,
} from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import {
  AuctionFields,
  auctionToInput,
  defaultAuction,
  type AuctionDraft,
} from '@/components/sell/auction-form';
import { ImageUploader } from '@/components/sell/image-uploader';
import {
  AuthenticityFields,
  BasicFields,
  DetailFields,
  draftToInput,
  emptyDraft,
  PriceFields,
  Section,
  type ProductDraft,
} from '@/components/sell/product-form';
import { Button } from '@/components/ui/button';
import { Alert, Progress } from '@/components/ui/display';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const DRAFT_KEY = 'shop-sell-draft';
type Step = 'photos' | 'basic' | 'price' | 'auction' | 'detail' | 'review';
const TITLE: Record<Step, string> = {
  photos: '작품 사진을 올려주세요',
  basic: '어떤 작품인가요?',
  price: '어떻게 판매할까요?',
  auction: '경매 조건을 정해주세요',
  detail: '작품 정보를 더해주세요',
  review: '마지막으로 확인해주세요',
};

/** zod 오류 → 필드별 메시지 */
function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[i.path.join('.')] ??= i.message;
  return out;
}

/**
 * 작품 등록 — 한 화면에 한 가지 질문 (요구사항 §19). 필수 입력만 먼저 받고 상세 정보는 선택.
 * 입력 중인 내용은 이 기기에 임시 저장해 새로고침·이탈 후에도 복구한다.
 */
function SellFlow() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user)!;
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.market.categories,
    staleTime: 10 * 60_000,
  });
  const [d, setD] = useState<ProductDraft>(emptyDraft);
  const [auction, setAuction] = useState<AuctionDraft>(defaultAuction);
  const [step, setStep] = useState<Step>('photos');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { d: ProductDraft; auction: AuctionDraft };
        if (saved.d?.images?.length || saved.d?.title) {
          setD({ ...emptyDraft(), ...saved.d });
          setAuction({ ...defaultAuction(), ...saved.auction });
          setRestored(true);
        }
      }
    } catch {
      // 임시 저장을 못 읽으면 새로 시작한다
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ d, auction }));
    } catch {
      // 저장소를 못 쓰는 환경은 임시 저장 없이 진행
    }
  }, [d, auction]);

  if (!user.isSeller) {
    return (
      <div className="page-x mx-auto flex max-w-xl flex-col gap-4 py-10">
        <h1 className="text-h1">판매자 등록이 필요해요</h1>
        <p className="text-body text-muted">판매 대금을 받을 계좌를 등록하면 바로 작품을 올릴 수 있어요.</p>
        <Button asChild size="lg">
          <Link href="/my/seller?next=/sell">판매자 등록하기</Link>
        </Button>
      </div>
    );
  }

  const steps: Step[] =
    d.saleType === 'AUCTION'
      ? ['photos', 'basic', 'price', 'auction', 'detail', 'review']
      : ['photos', 'basic', 'price', 'detail', 'review'];
  const idx = steps.indexOf(step);
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setD((x) => ({ ...x, [k]: v }));

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
      const r = createAuctionSchema.safeParse(
        auctionToInput(
          {
            ...auction,
            bidIncrement:
              auction.bidIncrement ?? (auction.startPrice ? suggestIncrement(auction.startPrice) : null),
          },
          'x',
        ),
      );
      if (!r.success) Object.assign(e, issuesToErrors(r.error.issues));
    }
    if (s === 'review') {
      const r = createProductSchema.safeParse(draftToInput(d, true));
      if (!r.success) Object.assign(e, issuesToErrors(r.error.issues));
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    setStep(steps[idx + 1]!);
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    setErrors({});
    setStep(steps[Math.max(0, idx - 1)]!);
  };

  const submit = async () => {
    if (!validate('review')) return;
    setPending(true);
    setError(null);
    try {
      const isAuction = d.saleType === 'AUCTION';
      // 경매 상품은 초안으로 만든 뒤 경매를 예약하면 게시된다 (서버 규칙)
      const product = await api.market.createProduct(draftToInput(d, !isAuction));
      if (isAuction) {
        const a = await api.auctions.create(
          auctionToInput(
            { ...auction, bidIncrement: auction.bidIncrement ?? suggestIncrement(auction.startPrice ?? 0) },
            product.id,
          ),
        );
        try {
          await api.auctions.schedule(a.id);
        } catch (e) {
          // 상품은 만들어졌으니 경매 조건만 고치도록 안내한다
          localStorage.removeItem(DRAFT_KEY);
          router.replace(
            `/seller/auctions/new?productId=${product.id}&error=${encodeURIComponent(e instanceof ApiError ? e.message : '경매 예약에 실패했어요')}`,
          );
          return;
        }
      }
      localStorage.removeItem(DRAFT_KEY);
      router.replace(`/products/${product.id}?registered=1`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <div className="flex items-center gap-2">
        {idx > 0 && (
          <button
            type="button"
            onClick={back}
            aria-label="이전 단계"
            className="-ml-2 rounded-sm p-2 hover:bg-surface-2"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        )}
        <span className="text-caption text-muted">
          작품 등록 · {idx + 1}/{steps.length}
        </span>
        {restored && idx === 0 && (
          <button
            type="button"
            className="ml-auto text-caption text-muted underline"
            onClick={() => {
              setD(emptyDraft());
              setAuction(defaultAuction());
              setRestored(false);
            }}
          >
            새로 작성
          </button>
        )}
      </div>
      <div className="mt-3">
        <Progress value={((idx + 1) / steps.length) * 100} label="등록 진행률" />
      </div>
      <h1 className="mt-5 mb-6 text-h1">{TITLE[step]}</h1>
      {restored && idx === 0 && <Alert className="mb-4">작성하던 내용을 불러왔어요.</Alert>}

      <div className="flex flex-col gap-4">
        {step === 'photos' && (
          <>
            <ImageUploader images={d.images} onChange={(v) => set('images', v)} />
            {errors.images && <Alert tone="destructive">{errors.images}</Alert>}
          </>
        )}
        {step === 'basic' && (
          <BasicFields d={d} set={set} categories={categories.data ?? []} errors={errors} />
        )}
        {step === 'price' && <PriceFields d={d} set={set} errors={errors} />}
        {step === 'auction' && (
          <AuctionFields a={auction} set={(p) => setAuction((x) => ({ ...x, ...p }))} errors={errors} />
        )}
        {step === 'detail' && (
          <>
            <Section title="작품 정보" description="모두 선택 입력이에요. 자세할수록 신뢰도가 높아져요.">
              <DetailFields d={d} set={set} errors={errors} />
            </Section>
            <Section title="진위 정보">
              <AuthenticityFields d={d} set={set} errors={errors} />
            </Section>
          </>
        )}
        {step === 'review' && (
          <dl className="divide-y divide-border-soft border-y border-border-soft text-small">
            {[
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
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[96px_1fr] gap-3 py-3">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {Object.keys(errors).length > 0 && step !== 'photos' && (
          <Alert tone="destructive">{Object.values(errors)[0]}</Alert>
        )}
        {error && <Alert tone="destructive">{error}</Alert>}
      </div>

      <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] mt-8 border-t border-border bg-background py-3 md:static md:border-none md:p-0">
        {step === 'review' ? (
          <Button size="lg" block loading={pending} onClick={() => void submit()}>
            {d.saleType === 'AUCTION' ? '작품 등록하고 경매 예약하기' : '작품 등록하기'}
          </Button>
        ) : (
          <Button size="lg" block onClick={next}>
            다음
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SellPage() {
  return (
    <RequireAuth>
      <SellFlow />
    </RequireAuth>
  );
}
