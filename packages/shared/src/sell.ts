import { suggestIncrement } from './auction';
import type { ImageDto, ProductDetailDto } from './dto';
import type { ItemCondition, ProvenanceKind, SaleType } from './enums';
import type { CreateAuctionInput } from './schemas/auction';
import type { CreateProductInput } from './schemas/product';

/**
 * 작품 등록·수정 폼 상태 (웹·앱 공용). 문자열 입력은 제출 시 숫자·null 로 바꾼다.
 * 날짜는 datetime-local 형식의 로컬 시각 문자열('YYYY-MM-DDTHH:mm')로 들고 있다가 ISO 로 바꾼다.
 */
export interface ProductDraft {
  images: ImageDto[];
  title: string;
  categoryId: string | undefined;
  artistName: string;
  description: string;
  saleType: SaleType;
  price: number | null;
  availableAt: string;
  era: string;
  productionYear: string;
  material: string;
  widthCm: string;
  heightCm: string;
  depthCm: string;
  condition: ItemCondition;
  conditionNote: string;
  region: string;
  shippingFee: number | null;
  shippingMethod: string;
  hasCertificate: boolean;
  certIssuer: string;
  certNumber: string;
  certIssuedAt: string;
  certNote: string;
  provenance: { kind: ProvenanceKind; period: string; title: string }[];
}

export const RETURN_POLICY_DEFAULT =
  '작품 특성상 단순 변심에 의한 반품은 어렵습니다. 상품 설명과 현저히 다른 경우 수령 후 7일 이내 반품 가능합니다.';

export const emptyDraft = (): ProductDraft => ({
  images: [],
  title: '',
  categoryId: undefined,
  artistName: '',
  description: '',
  saleType: 'FIXED',
  price: null,
  availableAt: '',
  era: '',
  productionYear: '',
  material: '',
  widthCm: '',
  heightCm: '',
  depthCm: '',
  condition: 'GOOD',
  conditionNote: '',
  region: '',
  shippingFee: 0,
  shippingMethod: '택배 (파손 방지 포장)',
  hasCertificate: false,
  certIssuer: '',
  certNumber: '',
  certIssuedAt: '',
  certNote: '',
  provenance: [],
});

/** Date → datetime-local 입력값 (로컬 시각 'YYYY-MM-DDTHH:mm') */
export const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function draftFromProduct(p: ProductDetailDto): ProductDraft {
  return {
    ...emptyDraft(),
    images: p.images,
    title: p.title,
    categoryId: p.category.id,
    artistName: p.artist?.name ?? '',
    description: p.description,
    saleType: p.saleType,
    price: p.price,
    availableAt: p.availableAt ? toLocalInput(new Date(p.availableAt)) : '',
    era: p.era ?? '',
    productionYear: p.productionYear?.toString() ?? '',
    material: p.material ?? '',
    widthCm: p.widthCm?.toString() ?? '',
    heightCm: p.heightCm?.toString() ?? '',
    depthCm: p.depthCm?.toString() ?? '',
    condition: p.condition,
    conditionNote: p.conditionNote ?? '',
    region: p.region ?? '',
    shippingFee: p.shippingFee,
    shippingMethod: p.shippingMethod,
    hasCertificate: !!p.certificate,
    certIssuer: p.certificate?.issuer ?? '',
    certNumber: p.certificate?.number ?? '',
    certIssuedAt: p.certificate?.issuedAt ?? '',
    certNote: p.certificate?.authenticityNote ?? '',
    provenance: p.provenance.map((v) => ({ kind: v.kind, period: v.period, title: v.title })),
  };
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

/** 폼 상태 → API 입력. 형식 검증은 공유 zod 스키마로 한다 */
export function draftToInput(d: ProductDraft, publish: boolean): CreateProductInput {
  return {
    title: d.title.trim(),
    categoryId: d.categoryId ?? '',
    description: d.description,
    images: d.images.map((i) => ({ key: i.key })),
    saleType: d.saleType,
    price: d.saleType === 'AUCTION' ? null : d.price,
    stock: 1,
    availableAt: d.saleType === 'RESERVATION' && d.availableAt ? new Date(d.availableAt).toISOString() : null,
    artistName: d.artistName.trim() || null,
    era: d.era.trim() || null,
    productionYear: num(d.productionYear),
    material: d.material.trim() || null,
    widthCm: num(d.widthCm),
    heightCm: num(d.heightCm),
    depthCm: num(d.depthCm),
    condition: d.condition,
    conditionNote: d.conditionNote.trim() || null,
    region: d.region.trim() || null,
    shippingFee: d.shippingFee ?? 0,
    shippingMethod: d.shippingMethod.trim() || '택배',
    returnPolicy: RETURN_POLICY_DEFAULT,
    certificate: d.hasCertificate
      ? {
          issuer: d.certIssuer.trim(),
          number: d.certNumber.trim(),
          issuedAt: d.certIssuedAt || null,
          imageKey: null,
          authenticityNote: d.certNote.trim(),
        }
      : null,
    provenance: d.provenance
      .filter((p) => p.title.trim())
      .map((p) => ({
        kind: p.kind,
        period: p.period.trim() || '연도 미상',
        title: p.title.trim(),
        description: '',
      })),
    publish,
  } as CreateProductInput;
}

export interface AuctionDraft {
  startPrice: number | null;
  bidIncrement: number | null;
  buyNowPrice: number | null;
  startsAt: string;
  endsAt: string;
  autoExtend: boolean;
  description: string;
}

export function defaultAuction(): AuctionDraft {
  const start = new Date(Date.now() + 60 * 60_000);
  start.setMinutes(0, 0, 0);
  return {
    startPrice: null,
    bidIncrement: null,
    buyNowPrice: null,
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(new Date(start.getTime() + 3 * 86_400_000)),
    autoExtend: true,
    description: '',
  };
}

export function auctionToInput(a: AuctionDraft, productId: string): CreateAuctionInput {
  return {
    productId,
    startPrice: a.startPrice ?? 0,
    bidIncrement: a.bidIncrement ?? suggestIncrement(a.startPrice ?? 0),
    buyNowPrice: a.buyNowPrice,
    startsAt: new Date(a.startsAt).toISOString(),
    endsAt: new Date(a.endsAt).toISOString(),
    autoExtend: a.autoExtend,
    description: a.description,
  };
}
