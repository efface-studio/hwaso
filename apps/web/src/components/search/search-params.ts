import {
  ITEM_CONDITIONS,
  PRODUCT_SORTS,
  SALE_TYPES,
  type ItemCondition,
  type ProductListParams,
  type ProductSort,
  type SaleType,
} from '@shop/shared';
import type { FilterValue } from './filter-panel';

// 검색·카테고리 목록의 URL ↔ 조회 조건 변환. 서버(첫 페이지 미리 렌더)와 클라이언트(SearchView)가 함께 쓴다

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

/** URL 이 필터 상태의 원천이다 (공유·뒤로가기 보존 — docs/WEB_ROUTES.md) */
export function parseSearch(sp: URLSearchParams, fixedCategory?: string) {
  const q = sp.get('q') ?? '';
  const sortRaw = sp.get('sort') as ProductSort | null;
  const sort: ProductSort = sortRaw && PRODUCT_SORTS.includes(sortRaw) ? sortRaw : q ? 'relevance' : 'latest';
  const filter: FilterValue = {
    category: fixedCategory ?? sp.get('category') ?? undefined,
    saleType: list(sp.get('saleType')).filter((v): v is SaleType =>
      (SALE_TYPES as readonly string[]).includes(v),
    ),
    minPrice: int(sp.get('minPrice')),
    maxPrice: int(sp.get('maxPrice')),
    condition: list(sp.get('condition')).filter((v): v is ItemCondition =>
      (ITEM_CONDITIONS as readonly string[]).includes(v),
    ),
    era: list(sp.get('era')),
    material: list(sp.get('material')),
    region: list(sp.get('region')),
    verifiedOnly: sp.get('verifiedOnly') === 'true',
  };
  return { q, sort, filter };
}

export function toListParams({ q, sort, filter }: ReturnType<typeof parseSearch>): ProductListParams {
  return {
    q: q || undefined,
    sort,
    category: filter.category,
    saleType: filter.saleType.length ? filter.saleType.join(',') : undefined,
    minPrice: filter.minPrice,
    maxPrice: filter.maxPrice,
    condition: filter.condition.length ? filter.condition.join(',') : undefined,
    era: filter.era.length ? filter.era.join(',') : undefined,
    material: filter.material.length ? filter.material.join(',') : undefined,
    region: filter.region.length ? filter.region.join(',') : undefined,
    verifiedOnly: filter.verifiedOnly || undefined,
    limit: 24,
  } as ProductListParams;
}

/** 서버가 첫 페이지를 미리 받을 때 기다리는 최대 시간 — 넘으면 기존처럼 클라이언트가 조회한다 (API 가 느려도 화면이 늦지 않게) */
export const SEED_TIMEOUT_MS = 2000;

/** 같은 조회 조건인지 (서버가 미리 받은 첫 페이지를 그대로 쓸 수 있는지) */
export const sameListParams = (a: ProductListParams, b: ProductListParams) =>
  JSON.stringify(a) === JSON.stringify(b);
