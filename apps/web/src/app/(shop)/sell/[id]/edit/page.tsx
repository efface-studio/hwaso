'use client';

import { ApiError } from '@shop/api-client';
import { updateProductSchema } from '@shop/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { ImageUploader } from '@/components/sell/image-uploader';
import {
  AuthenticityFields,
  BasicFields,
  DetailFields,
  draftFromProduct,
  draftToInput,
  PriceFields,
  Section,
  type ProductDraft,
} from '@/components/sell/product-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Badge } from '@/components/ui/display';
import { Breadcrumb } from '@/components/ui/navigation';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { toast } from '@/stores/toast';

const msg = (e: unknown) =>
  e instanceof ApiError ? e.message : '잠시 문제가 발생했습니다. 다시 시도해주세요.';

/** 작품 수정 ↔ 판매 중지/재개 ↔ 삭제 (연결 기능) */
function EditProduct({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const product = useQuery({ queryKey: ['product-edit', id], queryFn: () => api.market.product(id) });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: api.market.categories,
    staleTime: 10 * 60_000,
  });
  const [d, setD] = useState<ProductDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (product.data && !d) setD(draftFromProduct(product.data));
  }, [product.data, d]);

  if (product.isError)
    return (
      <Alert tone="destructive" className="m-6">
        {msg(product.error)}
      </Alert>
    );
  if (!product.data || !d) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-6 text-muted" />
      </div>
    );
  }
  const p = product.data;
  if (!p.isMine) {
    return (
      <Alert tone="destructive" className="m-6">
        내 작품만 수정할 수 있어요.
      </Alert>
    );
  }
  const auctionStarted = !!p.auction && ['LIVE', 'ENDED', 'SETTLED'].includes(p.auction.status);
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) =>
    setD((x) => (x ? { ...x, [k]: v } : x));

  const run = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setPending(label);
    try {
      await fn();
      toast.success(success);
      await qc.invalidateQueries({ queryKey: ['product-edit', id] });
    } catch (e) {
      toast.error(msg(e));
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

  return (
    <div className="page-x mx-auto max-w-2xl py-6 md:py-10">
      <Breadcrumb items={[{ href: '/seller', label: '판매 관리' }, { label: '작품 수정' }]} />
      <div className="mt-4 mb-6 flex items-center justify-between gap-3">
        <h1 className="text-h1">작품 수정</h1>
        <Link href={`/products/${id}`} className="text-small text-muted hover:text-foreground">
          판매 페이지 보기
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={p.status === 'ACTIVE' ? 'primary' : 'outline'}>
          {
            {
              ACTIVE: '판매 중',
              DRAFT: '임시 저장',
              HIDDEN: '판매 중지',
              RESERVED: '거래 중',
              SOLD: '판매 완료',
              SUSPENDED: '운영 정지',
              PENDING_REVIEW: '검수 중',
            }[p.status]
          }
        </Badge>
        {p.status === 'DRAFT' && p.saleType !== 'AUCTION' && (
          <Button
            size="sm"
            loading={pending === 'publish'}
            onClick={() => void run('publish', () => api.market.publishProduct(id), '작품을 게시했어요')}
          >
            게시하기
          </Button>
        )}
        {p.saleType === 'AUCTION' && !p.auction && (
          <Button size="sm" asChild>
            <Link href={`/seller/auctions/new?productId=${id}`}>경매 등록</Link>
          </Button>
        )}
        {p.status === 'ACTIVE' && (
          <Button
            size="sm"
            variant="outline"
            loading={pending === 'pause'}
            onClick={() => void run('pause', () => api.market.pauseProduct(id), '판매를 중지했어요')}
          >
            판매 중지
          </Button>
        )}
        {p.status === 'HIDDEN' && (
          <Button
            size="sm"
            variant="outline"
            loading={pending === 'resume'}
            onClick={() => void run('resume', () => api.market.resumeProduct(id), '판매를 다시 시작했어요')}
          >
            판매 재개
          </Button>
        )}
      </div>
      {auctionStarted && (
        <Alert className="mb-6">경매가 시작된 작품은 가격·판매 방식·사진을 바꿀 수 없어요.</Alert>
      )}

      <Section title="사진">
        {auctionStarted ? (
          <p className="text-small text-muted">사진 {d.images.length}장</p>
        ) : (
          <ImageUploader images={d.images} onChange={(v) => set('images', v)} />
        )}
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

      {Object.keys(errors).length > 0 && <Alert tone="destructive">{Object.values(errors)[0]}</Alert>}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
          삭제
        </Button>
        <Button size="lg" loading={pending === 'save'} onClick={save}>
          저장
        </Button>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="작품을 삭제할까요?"
        description="삭제하면 판매 페이지와 관심 목록에서 사라지며 되돌릴 수 없어요."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              loading={pending === 'delete'}
              onClick={async () => {
                setPending('delete');
                try {
                  await api.market.deleteProduct(id);
                  toast.show('작품을 삭제했어요');
                  router.replace('/seller');
                } catch (e) {
                  toast.error(msg(e));
                  setPending(null);
                  setConfirmDelete(false);
                }
              }}
            >
              삭제하기
            </Button>
          </>
        }
      />
    </div>
  );
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <EditProduct id={id} />
    </RequireAuth>
  );
}
