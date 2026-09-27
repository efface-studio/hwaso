import { CONDITION_LABEL, formatDimensions, VERIFICATION_LABEL, type ProductDetailDto } from '@shop/shared';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Alert, Badge } from '@/components/ui/display';
import { VerificationBadge } from './price';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="grid grid-cols-[96px_1fr] gap-4 py-2.5 md:grid-cols-[120px_1fr]">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-small">{value}</dd>
    </div>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-32 border-t border-border py-8">
      <h2 id={id} className="mb-4 text-h3">
        {title}
      </h2>
      {children}
    </section>
  );
}

const KIND_LABEL = { OWNERSHIP: '소장 이력', EXHIBITION: '전시 이력', PUBLICATION: '출판 기록' } as const;

export function ProductInfo({ product: p }: { product: ProductDetailDto }) {
  const size = formatDimensions(p.widthCm, p.heightCm, p.depthCm);
  const groups = (['OWNERSHIP', 'EXHIBITION', 'PUBLICATION'] as const)
    .map((k) => ({ kind: k, items: p.provenance.filter((v) => v.kind === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <Block id="desc" title="작품 설명">
        <p className="text-body whitespace-pre-wrap text-foreground-2">
          {p.description || '작품 설명이 없습니다.'}
        </p>
      </Block>

      <Block id="info" title="작품 정보">
        <dl className="divide-y divide-border-soft">
          <Row
            label="작가"
            value={
              p.artist ? (
                <Link href={`/artists/${p.artist.id}`} className="underline-offset-4 hover:underline">
                  {p.artist.name}
                </Link>
              ) : (
                p.artistName
              )
            }
          />
          <Row
            label="제작 시기"
            value={[p.era, p.productionYear ? `${p.productionYear}년` : null].filter(Boolean).join(' · ')}
          />
          <Row label="소재·기법" value={p.material} />
          <Row label="크기" value={size} />
          <Row label="제작처" value={p.maker} />
          <Row label="브랜드" value={p.brand} />
          <Row label="카테고리" value={p.category.path.map((c) => c.name).join(' › ')} />
          <Row
            label="상태"
            value={`${CONDITION_LABEL[p.condition]}${p.conditionNote ? ` — ${p.conditionNote}` : ''}`}
          />
          <Row label="거래 지역" value={p.region} />
        </dl>
      </Block>

      <Block id="cert" title="인증서 · 진위 정보">
        {p.certificate ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <VerificationBadge status={p.certificate.verificationStatus} />
              {p.certificate.verificationStatus === 'UNVERIFIED' && (
                <Badge tone="outline">{VERIFICATION_LABEL.UNVERIFIED}</Badge>
              )}
            </div>
            <dl className="divide-y divide-border-soft">
              <Row label="발급 기관" value={p.certificate.issuer} />
              <Row label="인증서 번호" value={p.certificate.number} />
              <Row label="발급일" value={p.certificate.issuedAt} />
              <Row label="비고" value={p.certificate.authenticityNote} />
              <Row
                label="검수일"
                value={
                  p.certificate.reviewedAt
                    ? new Date(p.certificate.reviewedAt).toLocaleDateString('ko-KR')
                    : null
                }
              />
            </dl>
            {p.certificate.verificationStatus !== 'VERIFIED' && (
              <Alert title="판매자가 제공한 정보입니다">
                플랫폼이 아직 원본과 실물을 대조하지 않았습니다. 구매 전 판매자에게 원본 사진을 요청해 보세요.
              </Alert>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-small text-muted">
            <Info className="size-4" aria-hidden />
            등록된 인증서가 없습니다.
          </p>
        )}
      </Block>

      {groups.length > 0 && (
        <Block id="prov" title="출처 · 전시 · 출판 이력">
          <p className="mb-4 text-small text-muted">
            판매자가 제공한 이력이며, 플랫폼 검수 완료 표시가 없으면 확인되지 않은 정보입니다.
          </p>
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <div key={g.kind}>
                <h3 className="mb-2 text-label font-semibold">{KIND_LABEL[g.kind]}</h3>
                <ol className="flex flex-col border-l border-border">
                  {g.items.map((v) => (
                    <li key={v.id} className="relative py-2 pl-4 text-small">
                      <span
                        className="absolute top-[14px] -left-[3px] size-[5px] rounded-full bg-foreground"
                        aria-hidden
                      />
                      {v.period && <span className="mr-2 text-muted">{v.period}</span>}
                      <span className="text-foreground-2">{v.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Block>
      )}

      <Block id="ship" title="배송 · 반품">
        <dl className="divide-y divide-border-soft">
          <Row label="배송 방법" value={p.shippingMethod} />
          <Row
            label="배송비"
            value={p.shippingFee === 0 ? '무료' : `${p.shippingFee.toLocaleString('ko-KR')}원`}
          />
          <Row label="반품 정책" value={<span className="whitespace-pre-wrap">{p.returnPolicy}</span>} />
        </dl>
      </Block>
    </div>
  );
}

export function SellerCard({ seller }: { seller: ProductDetailDto['seller'] }) {
  return (
    <Link
      href={`/users/${seller.id}`}
      className="flex items-center gap-3 rounded-sm border border-border p-4 hover:border-foreground"
    >
      <Avatar avatarKey={seller.avatarKey} name={seller.nickname} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-body-strong">
          <span className="truncate">{seller.nickname}</span>
          {seller.verified && <Badge tone="primary">인증 판매자</Badge>}
        </p>
        <p className="text-small text-muted">
          거래 {seller.tradeCount.toLocaleString('ko-KR')}회 · 평점 {seller.ratingAvg.toFixed(1)} (
          {seller.ratingCount})
        </p>
      </div>
    </Link>
  );
}
