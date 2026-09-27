'use client';

import { ApiError } from '@shop/api-client';
import { createAuctionSchema, suggestIncrement } from '@shop/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import {
  AuctionFields,
  auctionToInput,
  defaultAuction,
  type AuctionDraft,
} from '@/components/sell/auction-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { Breadcrumb } from '@/components/ui/navigation';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

/** 이미 등록된 경매 상품에 경매 일정을 등록(또는 유찰·취소 후 재등록) */
function NewAuction() {
  const params = useSearchParams();
  const productId = params.get('productId') ?? '';
  const router = useRouter();
  const product = useQuery({
    queryKey: ['product-edit', productId],
    queryFn: () => api.market.product(productId),
    enabled: !!productId,
  });
  const [a, setA] = useState<AuctionDraft>(defaultAuction);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(params.get('error'));
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const input = auctionToInput(
      { ...a, bidIncrement: a.bidIncrement ?? (a.startPrice ? suggestIncrement(a.startPrice) : null) },
      productId,
    );
    const r = createAuctionSchema.safeParse(input);
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[i.path.join('.')] ??= i.message;
      setErrors(e);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await api.auctions.create(r.data);
      await api.auctions.schedule(created.id);
      toast.success('경매를 예약했어요');
      router.replace(`/auctions/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <Breadcrumb items={[{ href: '/seller', label: '판매 관리' }, { label: '경매 등록' }]} />
      <h1 className="mt-4 text-h1">경매 등록</h1>
      {product.data && <p className="mt-1 text-body text-muted">{product.data.title}</p>}
      <div className="mt-6 flex flex-col gap-4">
        {error && <Alert tone="destructive">{error}</Alert>}
        <AuctionFields a={a} set={(p) => setA((x) => ({ ...x, ...p }))} errors={errors} />
        {Object.keys(errors).length > 0 && <Alert tone="destructive">{Object.values(errors)[0]}</Alert>}
        <Button size="lg" block loading={pending} onClick={() => void submit()} disabled={!productId}>
          경매 예약하기
        </Button>
      </div>
    </div>
  );
}

export default function NewAuctionPage() {
  return (
    <RequireAuth>
      <Suspense>
        <NewAuction />
      </Suspense>
    </RequireAuth>
  );
}
